const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { seed, cleanup, password } = require('./fixtures');
const Account = require('../src/models/Account');
const Teacher = require('../src/models/Teacher');
const Student = require('../src/models/Student');
const Attendance = require('../src/models/Attendance');
const jwt = require('jsonwebtoken');
const faceService = require('../src/services/faceRecognitionService');

test('Smart Attendance API regression flows with isolated MongoDB fixtures', async t => {
    let server;
    const tokens = {};
    process.env.ENABLE_DEV_ACTIVATION = 'true';
    const fx = await seed();
    try {
        const app = require('../src/app');
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const base = 'http://127.0.0.1:' + server.address().port + '/api';
        async function request(path, role, method = 'GET', body, tokenOverride) {
            const response = await fetch(base + path, {
                method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(tokens[role] ? { Authorization: 'Bearer ' + tokens[role] } : {}), ...(tokenOverride ? { Authorization: 'Bearer ' + tokenOverride } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            });
            const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
            return { status: response.status, data };
        }
        const ok = (response, status = 200) => assert.equal(response.status, status);
        await t.test('standalone server entry point binds once, connects to fixture DB and remains healthy', async () => {
            const { spawn } = require('child_process');
            const url = new URL(process.env.MONGODB_URI);
            url.pathname = '/' + mongoose.connection.name;
            const child = spawn(process.execPath, ['src/app.js'], { cwd: require('path').join(__dirname, '..'),
                env: { ...process.env, MONGODB_URI: url.toString(), PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            child.stdout.on('data', chunk => { output += chunk.toString(); });
            child.stderr.on('data', () => {});
            const closed = new Promise(resolve => child.once('close', resolve));
            try {
                const port = await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Standalone server did not become ready')), 15000);
                    child.stdout.on('data', () => {
                        const match = output.match(/Server is running on port (\d+)/);
                        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
                    });
                    child.once('exit', () => { clearTimeout(timer); reject(new Error('Standalone server exited unexpectedly')); });
                });
                await new Promise(resolve => setTimeout(resolve, 200));
                assert.equal(child.exitCode, null);
                const health = await fetch('http://127.0.0.1:' + port + '/api/health');
                assert.equal(health.status, 200);
            } finally { child.kill('SIGTERM'); await closed; }
        });
        await t.test('health and three roles login; public registration disabled; login ignores claimed role', async () => {
            ok(await request('/health'));
            for (const role of ['student', 'teacher', 'admin']) {
                const login = await request('/auth/login', null, 'POST', { email: fx.users[role].email.toUpperCase(), password, role: 'admin' });
                ok(login); assert.equal(login.data.user.role, role); assert.equal(login.data.user.id, String(fx.users[role]._id));
                assert.ok(!login.data.user.passwordHash); tokens[role] = login.data.token;
                ok(await request('/auth/me', role));
            }
            ok(await request('/auth/register', null, 'POST', { name: 'Blocked', email: 'blocked@example.test', password, role: 'admin' }), 403);
            ok(await request('/auth/login', null, 'POST', { email: {}, password }), 400);
            ok(await request('/auth/login', null, 'POST', { email: fx.users.teacher.email, password: 'invalid' }), 401);
        });
        await t.test('invalid, expired and legacy tokens return session errors; inactive accounts denied', async () => {
            for (const token of ['invalid', jwt.sign({ id: fx.users.teacher.id }, process.env.JWT_SECRET, { expiresIn: -1 }), jwt.sign({ id: new mongoose.Types.ObjectId() }, process.env.JWT_SECRET), jwt.sign({ id: 'invalid-id' }, process.env.JWT_SECRET)]) {
                const response = await request('/auth/me', 'teacher', 'GET', undefined, token);
                ok(response, 401); assert.equal(response.data.code, 'SESSION_INVALID');
            }
            await Account.findByIdAndUpdate(fx.users.student.id, { isActive: false });
            ok(await request('/auth/me', 'student'), 401);
            ok(await request('/auth/login', null, 'POST', { email: fx.users.student.email, password }), 401);
            await Account.findByIdAndUpdate(fx.users.student.id, { isActive: true });
        });
        await t.test('RBAC blocks student/admin writes and missing teacher profiles', async () => {
            for (const path of ['/students', '/teacher/profile', '/admin/accounts', '/attendance']) ok(await request(path, 'student'), 403);
            ok(await request('/attendance', 'admin', 'POST', { records: [] }), 403);
            ok(await request('/attendance/today', 'admin', 'DELETE'), 403);
            ok(await request('/admin/onboard-teacher', 'teacher', 'POST', { name: 'Blocked', email: 'blocked@example.test' }), 403);
            await Account.findByIdAndUpdate(fx.users.teacher.id, { $unset: { teacherProfileId: 1 } });
            ok(await request('/attendance', 'teacher', 'POST', { records: [] }), 403);
            await Account.findByIdAndUpdate(fx.users.teacher.id, { teacherProfileId: fx.teacher._id });
        });
        await t.test('both staff roles create students; duplicate and invalid inputs are useful errors; embeddings private', async () => {
            for (const role of ['teacher', 'admin']) {
                const response = await request('/students', role, 'POST', { studentId: 'NEW_' + role, name: 'New ' + role, email: '' });
                ok(response, 201); assert.ok(!('faceEmbedding' in response.data.student));
            }
            ok(await request('/students', 'admin', 'POST', { studentId: 'REG001', name: 'Duplicate' }), 400);
            ok(await request('/students', 'admin', 'POST', { studentId: 'DUP_EMAIL', name: 'Duplicate', email: fx.student.email }), 409);
            ok(await request('/students', 'admin', 'POST', { name: 'Missing ID' }), 400);
            ok(await request('/students/not-an-id', 'teacher'), 400);
            await Student.findByIdAndUpdate(fx.student._id, { faceEmbedding: [1, 2, 3] });
            const directory = await request('/students', 'teacher'); ok(directory);
            assert.ok(directory.data.students.every(s => !('faceEmbedding' in s)));
            const detail = await request('/students/' + fx.student.id, 'admin'); ok(detail); assert.ok(!('faceEmbedding' in detail.data.student));
        });
        await t.test('teacher student onboarding route works and activation preserves stored role', async () => {
            const response = await request('/teacher/onboard-student', 'teacher', 'POST', { studentProfileId: fx.otherStudent.id, role: 'admin' });
            ok(response, 201); assert.equal(response.data.account.role, 'student');
            const token = response.data._devOnly_activationToken;
            const context = await request('/auth/activation-context?token=' + token + '&role=admin'); ok(context); assert.equal(context.data.context.role, 'student');
            const activation = await request('/auth/activate', null, 'POST', { token, password, role: 'admin' }); ok(activation);
            ok(await request('/auth/activate', null, 'POST', { token, password }), 400);
            ok(await request('/auth/activation-context?token=' + token), 400);
            ok(await request('/auth/activate', null, 'POST', { token: 'invalid', password }), 400);
            const login = await request('/auth/login', null, 'POST', { email: fx.otherStudent.email, password }); ok(login); assert.equal(login.data.user.role, 'student');
            ok(await request('/teacher/onboard-student', 'teacher', 'POST', { studentProfileId: fx.otherStudent.id }), 409);
        });
        await t.test('admin teacher onboarding; expiration and pending status handling', async () => {
            const created = await request('/admin/onboard-teacher', 'admin', 'POST', { name: 'Pending Teacher', email: 'pending@example.test', subject: 'Regression', role: 'admin' });
            ok(created, 201); assert.equal(created.data.account.role, 'teacher');
            ok(await request('/admin/accounts/' + created.data.account.id + '/status', 'admin', 'PATCH', { isActive: true }), 409);
            const token = created.data._devOnly_activationToken;
            ok(await request('/auth/activation-context?token=' + token));
            await Account.findByIdAndUpdate(created.data.account.id, { activationTokenExpiry: new Date(0) });
            ok(await request('/auth/activation-context?token=' + token), 400);
            ok(await request('/auth/activate', null, 'POST', { token, password }), 400);
            ok(await request('/admin/onboard-teacher', 'admin', 'POST', { name: 'Duplicate', email: 'pending@example.test' }), 409);
        });
        await t.test('student onboarding cannot reissue another role or revive a disabled account', async () => {
            const conflict = await Student.create({ studentId: 'CONFLICT', name: 'Conflict', email: 'pending@example.test' });
            ok(await request('/teacher/onboard-student', 'teacher', 'POST', { studentProfileId: conflict.id }), 409);
            await Account.findByIdAndUpdate(fx.users.student.id, { isActive: false });
            ok(await request('/teacher/onboard-student', 'teacher', 'POST', { studentProfileId: fx.student.id }), 403);
            await Account.findByIdAndUpdate(fx.users.student.id, { isActive: true });
        });
        await t.test('manual attendance validates atomically, preserves teacher scope, and student sees only own records', async () => {
            ok(await request('/attendance', 'teacher', 'POST', { records: null }), 400);
            ok(await request('/attendance', 'teacher', 'POST', { records: [{ studentId: new mongoose.Types.ObjectId().toString(), status: 'present' }] }), 400);
            ok(await request('/attendance', 'teacher', 'POST', { records: [{ studentId: fx.student.id, status: 'present' }, { studentId: fx.otherStudent.id, status: 'absent' }] }), 201);
            const today = await request('/attendance/today', 'teacher'); ok(today); assert.equal(today.data.attendance[0].records.length, 2);
            const own = await request('/attendance/me', 'student'); ok(own); assert.equal(own.data.attendance.length, 1); assert.equal(own.data.attendance[0].status, 'present'); assert.ok(!own.data.attendance[0].records);
            ok(await request('/students/me', 'student'));
            const teacher2 = await Teacher.create({ name: 'Other Teacher', email: 'teacher2@example.test', password });
            await Attendance.create({ teacherId: teacher2.id, date: new Date(), subject: 'Other subject', records: [{ studentId: fx.student.id, studentName: fx.student.name, studentRollNo: fx.student.studentId, status: 'late' }] });
            assert.equal((await request('/attendance', 'teacher')).data.attendance.length, 1);
            assert.equal((await request('/attendance', 'admin')).data.attendance.length, 2);
        });
        await t.test('teacher/admin CSVs and invalid dates work without logging out admin', async () => {
            const date = new Date().toISOString().slice(0, 10);
            for (const role of ['teacher', 'admin']) {
                for (const path of ['/students/download/csv', '/attendance/download/today', '/attendance/download/' + date, '/attendance/download/range?fromDate=' + date + '&toDate=' + date]) {
                    const response = await request(path, role); ok(response); assert.equal(typeof response.data, 'string'); assert.ok(response.data.includes('REG001'));
                }
                ok(await request('/auth/me', role));
            }
            const admin = await request('/attendance/download/' + date, 'admin'); assert.ok(admin.data.includes('Other subject'));
            ok(await request('/attendance/date/invalid', 'teacher'), 400);
            ok(await request('/attendance/download/range?fromDate=2026-10-12&toDate=2026-10-11', 'teacher'), 400);
            ok(await request('/attendance?teacherId=invalid', 'admin'), 400);
        });
        await t.test('profile and password operations preserve account links and authentication', async () => {
            const updated = await request('/teacher/profile', 'teacher', 'PUT', { name: 'Updated Regression Teacher', subject: 'Updated' }); ok(updated);
            assert.equal((await request('/auth/me', 'teacher')).data.user.name, 'Updated Regression Teacher');
            const before = (await Account.findById(fx.users.teacher.id).select('+passwordHash')).passwordHash;
            const wrong = await request('/auth/change-password', 'teacher', 'PUT', { currentPassword: 'wrong', newPassword: 'UpdatedRegression!24' }); ok(wrong, 401); assert.ok(!wrong.data.code);
            const changed = await request('/auth/change-password', 'teacher', 'PUT', { currentPassword: password, newPassword: 'UpdatedRegression!24' }); ok(changed);
            const account = await Account.findById(fx.users.teacher.id).select('+passwordHash'); assert.ok(account.passwordHash !== before); assert.ok(await account.comparePassword('UpdatedRegression!24'));
            const teacher = await Teacher.findById(fx.teacher.id).select('+password'); assert.ok(await teacher.comparePassword('UpdatedRegression!24'));
            ok(await request('/auth/login', null, 'POST', { email: fx.users.teacher.email, password: 'UpdatedRegression!24' }));
        });
        await t.test('face failures remain distinct and never mark attendance; deterministic successful matches update absent records', async () => {
            const original = faceService.recognizeFace;
            try {
                for (const code of ['FACE_AUTH', 'FACE_TIMEOUT', 'FACE_UNAVAILABLE', 'FACE_MODEL']) {
                    faceService.recognizeFace = async () => ({ success: false, message: 'Test failure', code, httpStatus: 503 });
                    const before = await Attendance.countDocuments();
                    const response = await request('/attendance/face', 'teacher', 'POST', { image: 'synthetic' }); ok(response, 503); assert.equal(response.data.code, code);
                    assert.equal(await Attendance.countDocuments(), before); ok(await request('/attendance/today', 'teacher'));
                }
                faceService.recognizeFace = async () => ({ success: true, students: [] });
                ok(await request('/attendance/face', 'teacher', 'POST', { image: 'synthetic' }), 502);
                faceService.recognizeFace = async () => ({ success: true, students: [{ studentId: fx.otherStudent.studentId, confidence: 0.99 }] });
                ok(await request('/attendance/face', 'teacher', 'POST', { image: 'synthetic' }));
                assert.equal((await Attendance.findOne({ teacherId: fx.teacher.id })).records.find(r => String(r.studentId) === fx.otherStudent.id).status, 'present');
            } finally { faceService.recognizeFace = original; }
        });
        await t.test('multi-face and uploaded-photo routes update existing absent students without duplicate records', async () => {
            const original = faceService.recognizeMultipleFaces;
            try {
                for (const path of ['/attendance/face-multiple', '/attendance/bulk-photos']) {
                    await Attendance.updateOne({ teacherId: fx.teacher.id }, { $set: { 'records.$[r].status': 'absent' } }, { arrayFilters: [{ 'r.studentId': fx.student._id }] });
                    faceService.recognizeMultipleFaces = async () => ({ success: true, totalFaces: 1, recognizedStudents: [{ studentId: fx.student.studentId, confidence: 0.99 }] });
                    ok(await request(path, 'teacher', 'POST', { image: 'synthetic' }), 201);
                    const attendance = await Attendance.findOne({ teacherId: fx.teacher.id });
                    assert.equal(attendance.records.filter(r => String(r.studentId) === fx.student.id).length, 1);
                    assert.equal(attendance.records.find(r => String(r.studentId) === fx.student.id).status, 'present');
                    faceService.recognizeMultipleFaces = async () => ({ success: false, code: 'FACE_TIMEOUT', message: 'Safe test timeout', httpStatus: 503 });
                    ok(await request(path, 'teacher', 'POST', { image: 'synthetic' }), 503);
                }
            } finally { faceService.recognizeMultipleFaces = original; }
        });
        await t.test('admin status toggles affect current sessions, protect self/admin, and account responses are private', async () => {
            const list = await request('/admin/accounts', 'admin'); ok(list);
            assert.ok(list.data.accounts.every(a => !a.passwordHash && !a.activationTokenHash && !a.activationTokenExpiry));
            ok(await request('/admin/accounts/' + fx.users.admin.id + '/status', 'admin', 'PATCH', { isActive: false }), 400);
            ok(await request('/admin/accounts/' + fx.users.student.id + '/status', 'admin', 'PATCH', { isActive: false }));
            ok(await request('/auth/me', 'student'), 401);
            ok(await request('/admin/accounts/' + fx.users.student.id + '/status', 'admin', 'PATCH', { isActive: true }));
            ok(await request('/auth/me', 'student'));
        });
        await t.test('teacher/admin upload validation and actual teacher photo upload', async () => {
            const form = new FormData();
            form.append('profilePhoto', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'fixture.png');
            const response = await fetch(base + '/teacher/profile/photo', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.teacher }, body: form });
            ok({ status: response.status }); const body = await response.json(); assert.ok(body.profilePhoto.startsWith('/uploads/teachers/'));
            assert.equal((await request('/auth/me', 'teacher')).data.user.profilePhoto, body.profilePhoto);
            const invalid = new FormData(); invalid.append('studentId', 'UPLOAD_INVALID'); invalid.append('name', 'Invalid upload'); invalid.append('profilePhoto', new Blob(['text'], { type: 'text/plain' }), 'not-an-image.txt');
            const rejected = await fetch(base + '/students', { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.admin }, body: invalid }); ok({ status: rejected.status }, 400);
            // Remove only the file created by this fixture.
            const path = require('path'); const fs = require('fs');
            const photo = path.resolve(__dirname, '..', '.' + body.profilePhoto);
            const fixtureDir = path.resolve(__dirname, '../uploads/teachers/Updated_Regression_Teacher');
            assert.ok(photo.startsWith(fixtureDir + path.sep));
            fs.unlinkSync(photo);
            if (fs.readdirSync(fixtureDir).length === 0) fs.rmdirSync(fixtureDir);
        });
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await cleanup();
    }
});
