const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seedAnalytics, cleanup, password } = require('./analyticsFixtures');
const { Notification: N, NotificationWork: Work } = require('../src/models/Notification');
const { AcademicTerm, CourseOffering, LectureSession } = require('../src/models/Academic');
const Account = require('../src/models/Account');
const R = require('../src/services/notificationReconciliation');
const C = require('../src/services/attendanceCalculation');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
test('Persisted notification lifecycle, durable reconciliation and recipient isolation', async t => {
    const d = await seedAnalytics(), { fx } = d;
    const count = (filter = {}) => N.countDocuments({ hasAlert: { $ne: false }, ...filter });
    let server;
    try {
        await Promise.all([N.init(), Work.init()]);
        server = require('../src/app').listen(0, '127.0.0.1');
        await new Promise(r => server.once('listening', r));
        const base = 'http://127.0.0.1:' + server.address().port + '/api', tokens = {};
        for (const role of ['student', 'teacher', 'admin', 'otherTeacher']) {
            const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx.users[role].email, password }) });
            assert.equal(res.status, 200); tokens[role] = (await res.json()).token;
        }
        async function req(path, role = 'student', method = 'GET', body) {
            const res = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + tokens[role], 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: res.status, data: await res.json() };
        }
        const own = () => N.findOne({ hasAlert: { $ne: false }, recipientId: fx.users.student.id, offeringId: d.secondary.id });
        async function drain() {
            // Fan-out first; tests control execution rather than relying on timers.
            for (let i = 0; i < 4; i++) await R.dispatch(100);
            for (let i = 0; i < 100; i++) if (!await R.processOne()) return;
            assert.fail('Work failed to drain');
        }
        await t.test('GETs do not create alerts; valid exact and zero metrics, inactive/missing accounts skipped', async () => {
            assert.equal((await req('/notifications')).data.pagination.total, 0);
            assert.equal(await count(), 0);
            const before = JSON.stringify(await LectureSession.find().lean());
            await drain();
            assert.equal(await count(), 4);
            assert.equal(await count({ offeringId: d.zero.id }), 0);
            assert.equal(await count({ recipientId: fx.users.student.id, offeringId: d.primary.id }), 0); // exactly 75
            assert.equal(await count({ studentId: fx.otherStudent.id, recipientRole: 'student' }), 0); // no account
            assert.equal((await own()).status, 'active');
            assert.equal((await own()).percentage, 0);
            assert.equal(JSON.stringify(await LectureSession.find().lean()), before, 'reconciliation changed attendance');
        });
        await t.test('Teacher scope is their lectures, not the whole offering; no classmate leaks', async () => {
            const n = await N.findOne({ hasAlert: { $ne: false }, recipientId: fx.users.teacher.id, offeringId: d.primary.id });
            assert.equal(n.studentId.toString(), fx.otherStudent.id); assert.equal(n.attended, 1); assert.equal(n.eligible, 3); assert.equal(n.percentage, 33);
            const student = await req('/notifications'), teacher = await req('/notifications', 'teacher');
            assert.equal(student.status, 200); assert.equal(teacher.status, 200);
            assert.equal(teacher.data.pagination.total, 2);
            assert.ok(!JSON.stringify(student.data).includes(fx.otherStudent.id));
            for (const key of ['passwordHash', 'activationToken', 'faceEmbedding', 'recipientId', 'records', 'roster']) assert.ok(!JSON.stringify(student.data).includes('"' + key + '"'));
            assert.equal((await req('/notifications', 'admin')).status, 403);
        });
        await t.test('Individual and all-read are owned; repeated concurrent jobs create no duplicate/unread spam', async () => {
            const n = await own(), teacherAlert = await N.findOne({ hasAlert: { $ne: false }, recipientId: fx.users.teacher.id });
            assert.equal((await req('/notifications/' + teacherAlert.id + '/read', 'student', 'PATCH', {})).status, 404);
            assert.equal((await req('/notifications/' + n.id + '/read', 'student', 'PATCH', {})).status, 200);
            const readAt = (await own()).readAt;
            await Promise.all(Array.from({ length: 8 }, () => R.enqueue(d.secondary.id)));
            await Promise.all(Array.from({ length: 8 }, () => R.processOne()));
            assert.equal(await count(), 4); assert.deepEqual((await own()).readAt, readAt);
            const teacherUnread = (await req('/notifications/unread-count', 'teacher')).data.unread;
            assert.equal((await req('/notifications/read-all', 'student', 'PATCH', {})).status, 200);
            assert.equal((await req('/notifications/unread-count')).data.unread, 0);
            assert.equal((await req('/notifications/unread-count', 'teacher')).data.unread, teacherUnread);
        });
        await t.test('Recovery resolves; recurrent low reactivates unread once; incomplete is unavailable', async () => {
            const session = await LectureSession.findOne({ offeringId: d.secondary.id });
            await LectureSession.updateOne({ _id: session.id }, { $set: { 'records.0.status': 'late' } });
            await drain(); assert.equal((await own()).status, 'resolved'); assert.ok((await own()).readAt);
            await LectureSession.updateOne({ _id: session.id }, { $set: { 'records.0.status': 'absent' } });
            await drain(); assert.equal((await own()).status, 'active'); assert.equal((await own()).readAt, null);
            await req('/notifications/' + (await own()).id + '/read', 'student', 'PATCH', {});
            await LectureSession.updateOne({ _id: session.id }, { $set: { records: [] } });
            await drain(); const n = await own(); assert.equal(n.status, 'unavailable'); assert.equal(n.percentage, null); assert.match(n.reason, /incomplete/); assert.ok(n.readAt);
            await LectureSession.updateOne({ _id: session.id }, { $set: { records: [{ studentId: fx.student.id, status: 'absent', method: 'manual', markedAt: new Date() }] } });
            await drain(); assert.equal((await own()).status, 'active'); assert.ok((await own()).readAt, 'unavailable did not create a new episode');
        });
        await t.test('Cancellation excludes lectures and term-setting changes affect only matching offerings', async () => {
            const zeroPlan = await R.evaluate(d.zero.id); assert.equal(zeroPlan.entries[0].metric.status, 'No completed sessions');
            const before = await LectureSession.findById(d.sessions[0]._id).lean();
            const change = await req('/analytics/settings/' + d.term.id, 'admin', 'PUT', { minimumAttendancePercent: 50 }); assert.equal(change.status, 200);
            await R.dispatch(100);
            const dirtyTerm = await AcademicTerm.collection.findOne({ _id: d.term._id }); assert.equal(dirtyTerm.alertsDirty, false);
            await drain(); assert.equal((await N.findOne({ hasAlert: { $ne: false }, recipientId: fx.users.otherTeacher.id, offeringId: d.primary.id })).minimum, 50);
            assert.deepEqual(await LectureSession.findById(d.sessions[0]._id).lean(), before);
            const session = await LectureSession.findOne({ offeringId: d.secondary.id });
            assert.equal((await req('/academic/sessions/' + session.id, 'admin', 'PATCH', { state: 'cancelled', cancellationReason: 'ISOLATED test cancellation' })).status, 200);
            await drain(); assert.equal((await own()).status, 'unavailable'); assert.match((await own()).reason, /No completed/);
            const teacher = await N.findOne({ hasAlert: { $ne: false }, recipientId: fx.users.teacher.id, offeringId: d.secondary.id }); assert.equal(teacher.status, 'unavailable'); assert.match(teacher.reason, /No completed/);
        });
        await t.test('Ended assignments stop operational alerts, historical reads remain; changed profile hides history', async () => {
            await CourseOffering.updateOne({ _id: d.primary.id, 'assignments.teacherId': fx.teacher.id }, { $set: { 'assignments.$.endDate': '2025-12-31' } });
            await drain();
            const n = await N.findOne({ hasAlert: { $ne: false }, recipientId: fx.users.teacher.id, offeringId: d.primary.id }); assert.equal(n.status, 'resolved'); assert.match(n.reason, /ended/);
            assert.ok((await req('/notifications', 'teacher')).data.items.some(x => String(x._id) === n.id));
            await Account.updateOne({ _id: fx.users.teacher.id }, { $unset: { teacherProfileId: 1 } });
            assert.equal((await req('/notifications', 'teacher')).status, 403);
            await Account.updateOne({ _id: fx.users.teacher.id }, { $set: { teacherProfileId: fx.teacher.id } });
            await drain();
        });
        await t.test('Inactive recipients skipped and later activation reconciles saved work', async () => {
            await Account.updateOne({ _id: fx.users.otherTeacher.id }, { $set: { isActive: false } }); await drain();
            assert.equal((await req('/notifications', 'otherTeacher')).status, 401);
            assert.equal(await count({ recipientId: fx.users.otherTeacher.id, status: 'active' }), 0);
            await Account.updateOne({ _id: fx.users.otherTeacher.id }, { $set: { isActive: true } }); await drain();
            assert.equal(await count({ recipientId: fx.users.otherTeacher.id, status: 'active' }), 1);
        });
        await t.test('Source marker survives enqueue failure; retry is durable and attendance remains saved', async () => {
            const s = await d.lecture(d.zero, '2026-09-01T04:30:00Z', [], { state: 'scheduled', finalised: false, attendanceStarted: false });
            const original = Work.updateOne;
            Work.updateOne = () => Promise.reject(new Error('ISOLATED queue outage'));
            try {
                const response = await req('/academic/sessions/' + s.id + '/finalise', 'teacher', 'POST', {});
                assert.equal(response.status, 200); assert.equal((await LectureSession.findById(s.id)).finalised, true);
                await assert.rejects(() => R.dispatch(100));
                assert.equal((await LectureSession.collection.findOne({ _id: s._id })).alertsDirty, true);
            } finally { Work.updateOne = original; }
            await drain(); assert.equal(await count({ offeringId: d.zero.id, status: 'active' }), 2);
        });
        await t.test('Processing failure persists retry metadata and rerun completes once', async () => {
            await R.enqueue(d.zero.id);
            const Analytics = require('../src/services/attendanceAnalyticsService'), original = Analytics.calculate;
            Analytics.calculate = async () => { throw new Error('ISOLATED evaluation outage'); };
            try { await R.processOne(); } finally { Analytics.calculate = original; }
            const failed = await Work.findOne({ offeringId: d.zero.id }); assert.ok(failed.pending); assert.ok(failed.attempts); assert.ok(failed.lastFailedAt); assert.ok(!failed.lastFailure.includes('ISOLATED'));
            await Work.updateOne({ _id: failed.id }, { $set: { nextAttemptAt: new Date(0) } }); await drain();
            assert.equal((await Work.findById(failed.id)).pending, false); assert.equal(await count({ offeringId: d.zero.id }), 2);
        });
        await t.test('Older or source-stale evaluations cannot overwrite newer results; unique index enforces insert races', async () => {
            const old = await R.evaluate(d.zero.id), before = await N.findOne({ hasAlert: { $ne: false }, offeringId: d.zero.id });
            const version = before.evaluationVersion + 100;
            const fresh = await R.evaluate(d.zero.id);
            await R.applyEvaluation(fresh, version);
            await R.applyEvaluation(old, version - 1);
            assert.equal((await N.findById(before.id)).evaluationVersion, version);
            await LectureSession.updateOne({ offeringId: d.zero.id, finalised: true }, { $set: { 'records.0.status': 'late' } });
            assert.equal(await R.applyEvaluation(old, version + 1), false);
            const p = await R.evaluate(d.zero.id);
            await Promise.all([R.applyEvaluation(p, version + 2), R.applyEvaluation(p, version + 3)]);
            assert.equal(await count({ offeringId: d.zero.id }), 2);
        });
        await t.test('Filters/pagination validate; no submitted recipient authority or mass assignment', async () => {
            assert.equal((await req('/notifications?limit=1')).data.items.length, 1);
            assert.equal((await req('/notifications?status=active&unread=false&page=1&limit=1')).status, 200);
            for (const q of ['limit=101', 'page=0', 'status=bad', 'unread=1', 'recipientId=' + fx.users.teacher.id]) assert.equal((await req('/notifications?' + q)).status, 400);
            assert.equal((await req('/notifications/not-an-id/read', 'student', 'PATCH', {})).status, 400);
            assert.equal((await req('/notifications/read-all', 'student', 'PATCH', { recipientId: fx.users.teacher.id })).status, 400);
            const beforeCount = await count(); await req('/notifications'); await req('/notifications/unread-count'); assert.equal(await count(), beforeCount);
        });
        await t.test('Backfill default preview writes no notifications; bounded safe rerun', async () => {
            const before = await count(), jobs = await Work.countDocuments();
            const run = await promisify(execFile)(process.execPath, ['scripts/reconcile-notifications.js', '--dry-run', '--limit=2'], { cwd: require('path').join(__dirname, '..'), env: { ...process.env, MONGODB_URI: require('mongoose').connection.client.s.url.replace(/\/(?:[^/?]*)(\?|$)/, '/' + require('mongoose').connection.name + '$1') } });
            // URI override targets the isolated database; preview never queues real accounts.
            assert.match(run.stdout, /preview; no writes/); assert.equal(await count(), before); assert.equal(await Work.countDocuments(), jobs);
            const args = ['scripts/reconcile-notifications.js', '--execute', '--offering=' + d.privateOffering.id];
            const env = { ...process.env, MONGODB_URI: require('mongoose').connection.client.s.url.replace(/\/(?:[^/?]*)(\?|$)/, '/' + require('mongoose').connection.name + '$1') };
            for (let i = 0; i < 2; i++) await promisify(execFile)(process.execPath, args, { cwd: require('path').join(__dirname, '..'), env });
            assert.equal(await Work.countDocuments({ offeringId: d.privateOffering.id }), 1);
            assert.equal(await count(), before, 'execute queues work rather than processing in the command');
        });
        await t.test('Real activation path schedules previously skipped recipients without GET side effects', async () => {
            await AcademicTerm.updateOne({ _id: d.term.id }, { $set: { minimumAttendancePercent: 75 } });
            const account = new Account({ name: 'ISOLATED Pending Student', email: fx.otherStudent.email, role: 'student', studentProfileId: fx.otherStudent.id, isActive: false });
            await account.setPassword(password); const raw = account.generateActivationToken(); await account.save();
            await drain(); assert.equal(await count({ recipientId: account.id }), 0);
            assert.equal((await req('/auth/activate', 'student', 'POST', { token: raw, password })).status, 200);
            assert.equal((await Account.collection.findOne({ _id: account._id })).alertsDirty, true);
            await drain(); const n = await N.findOne({ hasAlert: { $ne: false }, recipientId: account.id, offeringId: d.primary.id }); assert.equal(n.status, 'active'); assert.equal(n.attended, 2); assert.equal(n.eligible, 4);
        });
        await t.test('Withdrawal and archive stop warnings without rewriting historical rosters or metrics', async () => {
            const roster = JSON.stringify(await LectureSession.find({ offeringId: d.primary.id }).select('roster records').lean());
            await CourseOffering.updateOne({ _id: d.primary.id, 'enrolments.studentId': fx.otherStudent.id }, { $set: { 'enrolments.$.endDate': '2025-12-31', 'enrolments.$.state': 'withdrawn' } });
            await drain();
            const n = await N.findOne({ hasAlert: { $ne: false }, studentId: fx.otherStudent.id, recipientRole: 'student' }); assert.equal(n.status, 'resolved'); assert.equal(n.eligible, 4); assert.ok(n.snapshotAt);
            assert.equal(JSON.stringify(await LectureSession.find({ offeringId: d.primary.id }).select('roster records').lean()), roster);
            const before = await count();
            await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { state: 'archived' } }); await drain();
            assert.equal(await count({ offeringId: d.primary.id, status: 'active' }), 0); assert.equal(await count(), before);
        });
        await t.test('Orphaned work completes safely rather than blocking the queue forever', async () => {
            await R.enqueue(d.privateOffering.id);
            await CourseOffering.collection.deleteOne({ _id: d.privateOffering._id }); // isolated corruption fixture only
            await drain();
            assert.equal((await Work.findOne({ offeringId: d.privateOffering.id })).pending, false);
        });
        await t.test('Large term fan-out persists a bounded cursor; unrelated offerings are not enqueued', async () => {
            const { ClassGroup } = require('../src/models/Academic'), { Types } = require('mongoose');
            const term = await AcademicTerm.create({ name: 'ISOLATED Bounded backfill', startDate: '2025-01-01', endDate: '2030-12-31' });
            const groups = await ClassGroup.insertMany(Array.from({ length: 51 }, (_, i) => ({ label: 'ISOLATED batch ' + i })));
            const offerings = groups.map(g => ({ _id: new Types.ObjectId(), courseId: d.primary.courseId, termId: term._id, classGroupId: g._id, state: 'active', assignments: [], enrolments: [], revision: 0 }));
            await CourseOffering.collection.insertMany(offerings);
            const unrelated = await Work.findOne({ offeringId: d.zero.id });
            await R.dispatch(1);
            let source = await AcademicTerm.collection.findOne({ _id: term._id }); assert.equal(source.alertsDirty, true); assert.ok(source.alertsCursor);
            assert.equal(await Work.countDocuments({ offeringId: { $in: offerings.map(o => o._id) } }), 50);
            await R.dispatch(1);
            source = await AcademicTerm.collection.findOne({ _id: term._id }); assert.equal(source.alertsDirty, false);
            assert.equal(await Work.countDocuments({ offeringId: { $in: offerings.map(o => o._id) } }), 51);
            assert.equal((await Work.findOne({ offeringId: d.zero.id })).requested, unrelated.requested);
        });
        await t.test('A paused old first insert cannot create a warning after a newer no-warning evaluation', async () => {
            await N.deleteMany({ offeringId: d.zero.id }); // isolated race setup only
            await LectureSession.updateOne({ offeringId: d.zero.id, finalised: true }, { $set: { 'records.0.status': 'absent' } });
            const old = await R.evaluate(d.zero.id), original = N.updateOne;
            let unblock, reached;
            const paused = new Promise(r => { reached = r; }), release = new Promise(r => { unblock = r; });
            let intercepted = false;
            N.updateOne = async function (filter, update, options) {
                if (!intercepted && String(filter.offeringId) === d.zero.id && update.$set?.evaluationVersion === 100000 && update.$set?.hasAlert === true) {
                    intercepted = true; reached(); await release;
                }
                return original.call(this, filter, update, options);
            };
            let slow;
            try {
                slow = R.applyEvaluation(old, 100000);
                await paused;
                await LectureSession.updateOne({ offeringId: d.zero.id, finalised: true }, { $set: { 'records.0.status': 'late' } });
                const fresh = await R.evaluate(d.zero.id);
                await R.applyEvaluation(fresh, 100001);
                unblock(); await slow;
                assert.equal(await count({ offeringId: d.zero.id }), 0);
                assert.equal(await N.countDocuments({ offeringId: d.zero.id, hasAlert: false, evaluationVersion: 100001 }), 2);
                assert.ok(!(await req('/notifications')).data.items.some(n => String(n.offeringId?._id) === d.zero.id));
            } finally { unblock(); if (slow) await slow; N.updateOne = original; }
        });
    } finally { if (server) await new Promise(r => server.close(r)); await cleanup(); }
});
test('Exact comparisons and lifecycle use the existing calculator, never rounded percentages', () => {
    const low = C.result({ eligible: 1000, present: 749, late: 0, absent: 251, invalid: 0 }, 75);
    assert.equal(low.percentage, 75); assert.equal(R.lifecycle(null, low).status, 'active');
    assert.equal(R.lifecycle(null, C.result({ eligible: 4, present: 2, late: 1, absent: 1, invalid: 0 }, 75)), null);
    assert.equal(R.lifecycle(null, C.result(C.emptyCounts(), 75)), null);
    assert.equal(R.lifecycle(null, { ...low, dataQuality: true, percentage: null, belowMinimum: null }), null);
    const read = new Date();
    const open = { status: 'active', episodeOpen: true, readAt: read };
    const invalid = { dataQuality: true, percentage: null, belowMinimum: null };
    const unavailable = R.lifecycle(open, invalid);
    assert.deepEqual(R.lifecycle(unavailable, low).readAt, read, 'ongoing episode does not spam unread');
    const recovered = R.lifecycle(open, { ...low, belowMinimum: false });
    const unavailableAfterRecovery = R.lifecycle(recovered, invalid);
    assert.equal(R.lifecycle(unavailableAfterRecovery, low).readAt, null, 'a new episode after recovery is unread even through incomplete data');
    assert.equal(R.lifecycle(open, { ...invalid, minimum: null }).minimum, null, 'an unavailable term minimum is not replaced by an old value');
});
