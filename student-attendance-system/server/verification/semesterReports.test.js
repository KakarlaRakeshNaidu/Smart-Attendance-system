const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seedAnalytics, cleanup, password } = require('./analyticsFixtures');
const { AcademicTerm, Course, CourseOffering, LectureSession } = require('../src/models/Academic');
const Student = require('../src/models/Student'), Account = require('../src/models/Account');
const Analytics = require('../src/services/attendanceAnalyticsService');
const Csv = require('../src/services/semesterReportCsv');
const S = require('../src/services/semesterReportService');

// Independent CSV reader for round-trip assertions, including quoted CR/LF and Unicode.
function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
        else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
        else if ((c === '\r' || c === '\n') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const headers = rows.shift();
    assert.ok(rows.every(r => r.length === headers.length));
    return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
test('Semester CSV quotes Unicode/delimiters, neutralises formulas and preserves numeric columns', () => {
    const plain = 'రాకేష్, "Naidu"\r\nSecond line';
    assert.equal(Csv.safeText(plain), plain);
    for (const text of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '  =1', '\t=1', '\r=1', '\n=1', '\u200b=1', '\uFEFF=1', '＝1', '＋1', '－1', '＠1', '\tplain']) assert.ok(Csv.safeText(text).startsWith('[text] '), JSON.stringify(text));
    const metadata = { reportType: 'personal', reportLabel: 'Personal term summary', scope: 'Own', term: { name: '../Term\r\nUnsafe "header"' },
        period: 'Full term', from: '2026-01-01', to: '2026-06-30', generatedAt: new Date('2026-06-30T18:30:00Z'), generatedAtCampus: '2026-07-01T00:00:00+05:30',
        minimum: 75, filterLabels: {}, thresholdInterpretation: 'Current minimum', legacyExclusion: 'Legacy excluded', consistency: 'Checked' };
    const row = { name: plain, rollNo: '=FORMULA', course: { code: 'TEST', name: 'CSV, testing' }, classGroup: { label: 'Test', section: 'A' },
        present: 2, late: 1, absent: 1, invalid: 0, eligible: 4, attended: 3, percentage: 75, status: 'At or above minimum', dataQuality: false };
    const file = Csv.build({ metadata, rows: [row, { ...row, percentage: null, dataQuality: true, status: 'Incomplete data' }] });
    const csv = parseCsv(file.csv); assert.equal(csv[0]['Student name'], plain); assert.equal(csv[0]['Student/roll number'], '[text] =FORMULA');
    assert.equal(csv[0]['Present'], '2'); assert.equal(csv[0]['Attendance percentage (%)'], '75'); assert.equal(csv[1]['Attendance percentage (%)'], '');
    assert.match(csv[1]['Data quality'], /Incomplete/); assert.match(file.filename, /^[A-Za-z0-9_.-]+\.csv$/); assert.ok(!file.filename.includes('Unsafe "'));
    assert.ok(!Csv.safeText('<script>https://evil.example</script>').includes('<script>'));
    assert.ok(!Csv.safeText('https://evil.example').includes('https://'));
    assert.throws(() => Csv.build({ metadata, rows: [{ ...row, name: 'x'.repeat(Csv.MAX_BYTES) }] }), e => e.status === 422);
});

test('Semester Reports: role scope, coherent calculations, complete CSV and bounded generation', async t => {
    const d = await seedAnalytics(), { fx } = d; let server;
    try {
        const other = new Account({ name: 'ISOLATED Other Student', email: fx.otherStudent.email, role: 'student', studentProfileId: fx.otherStudent.id, isActive: true });
        await other.setPassword(password); await other.save(); fx.users.otherStudent = other;
        server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
        const base = 'http://127.0.0.1:' + server.address().port + '/api', tokens = {};
        for (const role of ['student', 'otherStudent', 'teacher', 'otherTeacher', 'admin']) {
            const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx.users[role].email, password }) });
            assert.equal(res.status, 200); tokens[role] = (await res.json()).token;
        }
        async function req(path, role = 'admin', method = 'GET', body, signal) {
            const res = await fetch(base + path, { method, signal, headers: { Authorization: 'Bearer ' + tokens[role], 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
            const text = await res.text(); return { status: res.status, headers: res.headers, text, data: res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
        }
        function ok(r, status = 200) { assert.equal(r.status, status, r.data?.message || r.text.slice(0, 200)); return r.data; }
        const query = values => new URLSearchParams({ termId: d.term.id, ...values }).toString();
        const preview = (values = {}, role = 'admin') => req('/reports?' + query(values), role);
        const csv = (values = {}, role = 'admin') => req('/reports/export.csv?' + query(values), role);
        const safe = value => { for (const key of ['passwordHash', 'activationToken', 'faceEmbedding', 'studentReason', 'decisionReason', 'correctionAudit']) assert.ok(!JSON.stringify(value).includes(key)); };
        await t.test('Term selection and strict role/ownership validation apply equally to preview and export', async () => {
            ok(await req('/reports', 'student'), 400);
            for (const endpoint of ['/reports?', '/reports/export.csv?']) {
                for (const values of [{ studentId: fx.otherStudent.id }, { offeringId: d.privateOffering.id }, { type: 'institution' }, { teacherId: fx.teacher.id }]) ok(await req(endpoint + query(values), 'student'), 403);
                ok(await req(endpoint + query({ teacherId: d.otherTeacher.id }), 'teacher'), 403);
                ok(await req(endpoint + query({ offeringId: d.privateOffering.id }), 'teacher'), 403);
                for (const values of [{ termId: 'bad' }, { limit: '101' }, { page: '0' }, { sort: 'evil' }, { from: '2026-02-30' }, { from: '2026-03-01', to: '2026-02-01' }, { from: '2024-01-01' }, { role: 'admin' }]) ok(await req(endpoint + query(values)), 400);
            }
            ok(await req('/reports/options?kind=students', 'student'), 403); ok(await req('/reports/options?kind=teachers', 'teacher'), 403);
            assert.ok(!JSON.stringify(ok(await req('/reports/options?kind=offerings', 'student'))).includes('AN-PRIVATE'));
        });
        await t.test('Personal term rows agree with shared Analytics, including zero-session and weighted totals', async () => {
            const report = ok(await preview({}, 'student')); safe(report);
            assert.equal(report.rows.length, 3); assert.ok(report.rows.every(r => r.studentId === fx.student.id)); assert.ok(!JSON.stringify(report).includes('Other Student'));
            assert.equal(report.summary.eligible, 5); assert.equal(report.summary.attended, 3); assert.equal(report.summary.percentage, 60);
            const primary = report.rows.find(r => r.offeringId === d.primary.id); assert.equal(primary.percentage, 75); assert.equal(primary.belowMinimum, false);
            assert.equal(report.rows.find(r => r.offeringId === d.zero.id).percentage, null);
            const analytics = ok(await req('/analytics/student?' + query({}), 'student'));
            for (const row of report.rows) { const a = analytics.students.items.find(a => a.offeringId === row.offeringId); for (const key of ['eligible', 'present', 'late', 'absent', 'attended', 'percentage', 'belowMinimum']) assert.equal(row[key], a[key], key); }
            assert.equal(report.metadata.period, 'Full term'); assert.match(report.metadata.generatedAtCampus, /\+05:30$/);
        });
        await t.test('Teacher reports contain taught lectures only, including permitted historical reads', async () => {
            const r = ok(await preview({}, 'teacher')); assert.match(r.metadata.scope, /lectures you taught/);
            assert.equal(r.rows.find(x => x.offeringId === d.primary.id && x.studentId === fx.student.id).eligible, 3);
            assert.ok(!JSON.stringify(r).includes('AN-PRIVATE')); assert.equal(r.summary.eligible, 7);
            const exported = await csv({}, 'teacher'); ok(exported);
            const rows = parseCsv(exported.text); assert.ok(rows.every(row => row['Role/data scope'].includes('lectures you taught')));
            assert.ok(!exported.text.includes('AN-PRIVATE'));
            assert.equal(+rows.find(row => row['Course code'] === 'AN-PRIMARY' && row['Student/roll number'] === fx.student.studentId)['Eligible completed/finalised sessions'], 3);
            const original = d.primary.assignments.map(a => a.toObject());
            await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { assignments: original.map(a => ({ ...a, endDate: '2026-06-30' })) } });
            try { assert.equal(ok(await preview({ offeringId: d.primary.id }, 'teacher')).rows[0].eligible, 3); }
            finally { await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { assignments: original } }); }
        });
        await t.test('Admin class/course/Teacher/Student filters keep unique profiles, result pairs and lectures distinct', async () => {
            const all = ok(await preview({ type: 'institution' })); assert.equal(all.rows.length, 1);
            assert.equal(all.rows[0].uniqueStudents, 2); assert.equal(all.rows[0].studentOfferingResults, 5);
            assert.equal(all.rows[0].countableSessions, 5); assert.equal(all.rows[0].eligible, 9); assert.equal(all.rows[0].attended, 5); assert.equal(all.rows[0].percentage, 56);
            assert.equal(all.rows[0].belowMinimumResults, 2); assert.equal(all.rows[0].noSessionResults, 2);
            const foreign = ok(await preview({ type: 'classes', classGroupId: d.foreignGroup.id })); assert.equal(foreign.rows.length, 1); assert.equal(foreign.rows[0].eligible, 0); assert.equal(foreign.rows[0].percentage, null);
            const teacher = ok(await preview({ teacherId: fx.teacher.id })); assert.equal(teacher.summary.eligible, 7); assert.ok(!JSON.stringify(teacher).includes('AN-PRIVATE'));
            assert.equal(ok(await preview({ studentId: fx.student.id })).rows.length, 3);
            const empty = ok(await preview({ classGroupId: d.foreignGroup.id, studentId: fx.student.id }));
            assert.equal(empty.rows.length, 0); assert.equal(empty.metadata.filterLabels.classGroup, 'ISOLATED Private class B'); assert.equal(empty.metadata.filterLabels.student, fx.student.name);
            const courses = ok(await preview({ type: 'courses' })); assert.equal(courses.rows.length, 4); assert.equal(courses.rows.find(r => r.offeringId === d.primary.id).countableSessions, 4);
        });
        await t.test('CSV exports every matching row beyond preview pagination, with safe headers and no private fields', async () => {
            const first = ok(await preview({ limit: '1' })), second = ok(await preview({ limit: '1', page: '2' }));
            assert.equal(first.rows.length, 1); assert.notEqual(first.rows[0].offeringId + first.rows[0].studentId, second.rows[0].offeringId + second.rows[0].studentId);
            const exported = await csv({ limit: '1', page: '2' }); ok(exported); assert.match(exported.headers.get('content-type'), /^text\/csv/);
            assert.equal(exported.headers.get('x-report-rows'), String(first.pagination.total)); assert.match(exported.headers.get('content-disposition'), /^attachment; filename="[A-Za-z0-9_.-]+\.csv"$/);
            const rows = parseCsv(exported.text), full = ok(await preview({ limit: '100' })); assert.equal(rows.length, full.rows.length);
            for (let i = 0; i < rows.length; i++) { assert.equal(+rows[i]['Eligible completed/finalised sessions'], full.rows[i].eligible); assert.equal(rows[i]['Attendance percentage (%)'], full.rows[i].percentage === null ? '' : String(full.rows[i].percentage)); }
            assert.ok(rows.every(r => +r['Report aggregate attended (repeated metadata)'] === full.summary.attended));
            safe(exported.text); assert.ok(!exported.text.includes(fx.student.id)); assert.ok(!exported.text.includes('example.test'));
            const own = parseCsv((await csv({}, 'student')).text); assert.ok(own.every(r => r['Student/roll number'] === fx.student.studentId));
        });
        await t.test('Campus-inclusive dates keep same-day lectures separate and label selected-period reports', async () => {
            const r = ok(await preview({ offeringId: d.primary.id, from: '2026-02-02', to: '2026-02-02' }, 'student'));
            assert.equal(r.rows[0].eligible, 2); assert.equal(r.rows[0].attended, 1); assert.equal(r.rows[0].percentage, 50); assert.equal(r.metadata.period, 'Selected-period report');
            assert.equal(ok(await preview({ offeringId: d.primary.id, from: '2026-02-01', to: '2026-02-01' }, 'student')).rows[0].late, 1);
        });
        await t.test('Saved eligibility survives later enrolment edits; ended/zero-session enrolments are not invented absences', async () => {
            const original = d.primary.enrolments.map(e => e.toObject());
            await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { enrolments: [] } });
            try { assert.equal(ok(await preview({ offeringId: d.primary.id }, 'student')).rows[0].eligible, 4); }
            finally { await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { enrolments: original } }); }
            const r = ok(await preview({ offeringId: d.zero.id })); assert.equal(r.rows[0].status, 'No completed sessions'); assert.equal(r.rows[0].absent, 0);
        });
        await t.test('Incomplete finalised marks suppress affected rows and aggregates; reports never repair them', async () => {
            const session = d.sessions[0], before = session.toObject();
            for (const variant of ['missing', 'conflict', 'extra', 'unknown-roster']) {
                const records = before.records.map(r => ({ ...r })); if (variant === 'missing') records.shift();
                if (variant === 'conflict') records.push({ ...records[0], status: 'absent' });
                if (variant === 'extra') records.push({ ...records[0], studentId: new (require('mongoose').Types.ObjectId)() });
                await LectureSession.collection.updateOne({ _id: session._id }, { $set: { records, roster: variant === 'unknown-roster' ? [] : before.roster } });
                try {
                    const saved = JSON.stringify(await LectureSession.findById(session.id).lean());
                    const r = ok(await preview({ offeringId: d.primary.id })); assert.equal(r.summary.percentage, null, variant); assert.equal(r.summary.dataQuality, true);
                    const course = ok(await preview({ offeringId: d.primary.id, type: 'courses' })); assert.equal(course.rows[0].percentage, null);
                    if (variant === 'extra') { assert.ok(r.rows.every(row => row.percentage === null)); const old = ok(await req('/analytics/admin?' + query({ offeringId: d.primary.id }))); assert.ok(old.students.items.every(row => row.percentage === null)); }
                    assert.equal(JSON.stringify(await LectureSession.findById(session.id).lean()), saved);
                } finally { await LectureSession.collection.updateOne({ _id: session._id }, { $set: { records: before.records, roster: before.roster } }); }
            }
        });
        await t.test('Current term minimum uses exact comparisons; attendance and notifications are read-only', async () => {
            await AcademicTerm.collection.updateOne({ _id: d.term._id }, { $set: { minimumAttendancePercent: 0 } });
            ok(await preview({}, 'student'), 409);
            await AcademicTerm.updateOne({ _id: d.term.id }, { $set: { minimumAttendancePercent: 75.00001 } });
            const before = JSON.stringify(await LectureSession.find().sort({ _id: 1 }).lean());
            const { Notification, NotificationWork } = require('../src/models/Notification');
            const notifications = JSON.stringify(await Notification.find().lean()), work = JSON.stringify(await NotificationWork.find().lean());
            try {
                const r = ok(await preview({ offeringId: d.primary.id }, 'student')); assert.equal(r.rows[0].percentage, 75); assert.equal(r.rows[0].belowMinimum, true); assert.equal(r.metadata.minimum, 75.00001);
                ok(await csv({}, 'student')); assert.equal(JSON.stringify(await LectureSession.find().sort({ _id: 1 }).lean()), before);
                assert.equal(JSON.stringify(await Notification.find().lean()), notifications); assert.equal(JSON.stringify(await NotificationWork.find().lean()), work);
            } finally { await AcademicTerm.updateOne({ _id: d.term.id }, { $set: { minimumAttendancePercent: 75 } }); }
        });
        await t.test('Pending/rejected corrections do not change reports; approved correction updates totals and existing warning', async () => {
            const s = await LectureSession.findOne({ offeringId: d.secondary.id });
            const original = ok(await preview({ offeringId: d.secondary.id }, 'student')).rows[0]; assert.equal(original.attended, 0);
            let r = ok(await req('/corrections/sessions/' + s.id, 'student', 'POST', { requestedStatus: 'late', reason: 'ISOLATED request for report integration.' }), 201).item;
            assert.equal(ok(await preview({ offeringId: d.secondary.id }, 'student')).rows[0].attended, 0);
            ok(await req('/corrections/sessions/' + s.id + '/requests/' + r.id + '/reject', 'teacher', 'POST', { reason: 'ISOLATED rejection: current evidence insufficient.' }));
            assert.equal(ok(await preview({ offeringId: d.secondary.id }, 'student')).rows[0].attended, 0);
            const R = require('../src/services/notificationReconciliation'); await R.tick();
            r = ok(await req('/corrections/sessions/' + s.id, 'student', 'POST', { requestedStatus: 'late', reason: 'ISOLATED reviewed evidence for report integration.' }), 201).item;
            ok(await req('/corrections/sessions/' + s.id + '/requests/' + r.id + '/approve', 'teacher', 'POST', { reason: 'ISOLATED reviewed evidence confirms late.' }));
            const updated = ok(await preview({ offeringId: d.secondary.id }, 'student')); assert.equal(updated.rows[0].late, 1); assert.equal(updated.rows[0].percentage, 100);
            assert.equal(+parseCsv((await csv({ offeringId: d.secondary.id }, 'student')).text)[0]['Attended sessions (present + late)'], 1);
            await R.tick(); const alert = await require('../src/models/Notification').Notification.findOne({ offeringId: d.secondary.id, recipientId: fx.users.student.id }); assert.equal(alert.status, 'resolved');
        });
        await t.test('Legacy remains accessible and excluded; empty academic scopes fail export clearly', async () => {
            assert.ok(await require('../src/models/Attendance').exists({ _id: d.legacy.id })); assert.match(ok(await preview({}, 'student')).metadata.legacyExclusion, /Unmapped legacy/);
            const before = ok(await preview({}, 'student')).summary.eligible;
            const mapped = await d.lecture(d.secondary, '2026-03-01T03:30:00Z', ['late'], { legacyAttendanceId: d.legacy.id });
            try { assert.equal(ok(await preview({}, 'student')).summary.eligible, before + 1); assert.ok(await require('../src/models/Attendance').exists({ _id: d.legacy.id })); }
            finally { await LectureSession.deleteOne({ _id: mapped.id }); }
            const term = await AcademicTerm.create({ name: 'ISOLATED Empty report term', startDate: '2026-01-01', endDate: '2026-06-30' });
            const r = ok(await preview({ termId: term.id })); assert.equal(r.rows.length, 0); assert.equal(r.summary.percentage, null);
            const empty = await csv({ termId: term.id }); ok(empty, 422); assert.match(empty.headers.get('content-type'), /json/);
        });
        await t.test('Concurrent source changes retry coherently or fail explicitly, never exporting a mixed report', async () => {
            const original = Analytics.calculate, s = d.sessions[0]; let calls = 0;
            const mutate = () => LectureSession.updateOne({ _id: s.id }, { $inc: { revision: 1 } });
            try {
                Analytics.calculate = async (...args) => { const r = await original(...args); if (++calls === 1) await mutate(); return r; };
                ok(await preview({ offeringId: d.primary.id }, 'student')); assert.equal(calls, 4);
                calls = 0; Analytics.calculate = async (...args) => { const r = await original(...args); calls++; await mutate(); return r; };
                const failed = await csv({ offeringId: d.primary.id }, 'student'); ok(failed, 409); assert.match(failed.data.message, /changed during/); assert.match(failed.headers.get('content-type'), /json/); assert.equal(calls, 4);
            } finally { Analytics.calculate = original; }
        });
        await t.test('Generation locks prevent duplicate work and release after failure/client cancellation', async () => {
            const original = Analytics.calculate; let release, entered;
            const gate = new Promise(r => { release = r; }), started = new Promise(r => { entered = r; });
            Analytics.calculate = async (...args) => { entered(); await gate; return original(...args); };
            const controller = new AbortController(), held = req('/reports/export.csv?' + query({}), 'admin', 'GET', null, controller.signal).catch(e => e);
            try { await started; ok(await preview({}), 429); controller.abort(); }
            finally { release(); await held; Analytics.calculate = original; }
            // Wait for cancellation cleanup via a subsequent request, with no timing-based sleep.
            let result; for (let i = 0; i < 10; i++) { result = await preview({}); if (result.status !== 429) break; }
            ok(result);
        });
        await t.test('Inactive accounts cannot preview/export using previously issued tokens', async () => {
            await Account.updateOne({ _id: fx.users.student.id }, { $set: { isActive: false } });
            try { ok(await preview({}, 'student'), 401); ok(await csv({}, 'student'), 401); }
            finally { await Account.updateOne({ _id: fx.users.student.id }, { $set: { isActive: true } }); }
        });
        await t.test('500 Students x 40 lectures exports completely; a larger opportunity scope fails explicitly', async () => {
            const profiles = await Student.insertMany(Array.from({ length: 500 }, (_, i) => ({ studentId: 'REPORT-PERF-' + i, name: 'ISOLATED Report performance ' + i })));
            const course = await Course.create({ code: 'REPORT-PERF', name: 'ISOLATED report performance' });
            const offering = await CourseOffering.create({ courseId: course.id, termId: d.term.id, classGroupId: d.group.id,
                enrolments: profiles.map(s => ({ studentId: s.id, startDate: '2026-01-01', endDate: '2026-06-30' })) });
            const make = i => { const start = new Date(Date.UTC(2026, 3, 1, 0, i * 30)); return { offeringId: offering.id, teacherId: fx.teacher.id,
                scheduledStart: start, scheduledEnd: new Date(+start + 1200000), campusDate: require('../src/services/academicService').campusDate(start),
                state: 'completed', finalised: true, attendanceStarted: true, roster: profiles.map(s => ({ studentId: s.id, name: s.name, rollNo: s.studentId })),
                records: profiles.map((s, j) => ({ studentId: s.id, status: ['present', 'late', 'absent'][j % 3], method: 'manual', markedAt: start })), createdBy: fx.users.admin.id, updatedBy: fx.users.admin.id }; };
            await LectureSession.insertMany(Array.from({ length: 40 }, (_, i) => make(i)));
            const mongoose = require('mongoose'), debug = mongoose.get('debug'); let operations = 0;
            mongoose.set('debug', () => { operations++; }); const started = performance.now(); let exported;
            try { exported = await csv({ offeringId: offering.id, limit: '1' }); ok(exported); }
            finally { mongoose.set('debug', debug || false); }
            const rows = parseCsv(exported.text); assert.equal(rows.length, 500); assert.ok(rows.every(r => +r['Eligible completed/finalised sessions'] === 40));
            assert.ok(operations <= 45, 'Bounded queries, not one query per Student/session');
            console.log('Semester report fixture: 500 Students x 40 lectures; ' + Math.round(performance.now() - started) + ' ms HTTP; ' + Buffer.byteLength(exported.text) + ' CSV bytes; ' + operations + ' database method calls (cursor batches excluded).');
            const plan = await LectureSession.find({ offeringId: offering._id, state: 'completed', finalised: true }).sort({ scheduledStart: 1, _id: 1 }).select('_id').explain('executionStats');
            assert.ok(plan.executionStats.totalKeysExamined > 0); assert.equal(plan.executionStats.nReturned, 40);
            await LectureSession.insertMany(Array.from({ length: 161 }, (_, i) => make(i + 40)));
            const tooLarge = await csv({ offeringId: offering.id }); ok(tooLarge, 422); assert.match(tooLarge.data.message, /opportunities/); assert.match(tooLarge.headers.get('content-type'), /json/);
        });
    } finally { if (server) await new Promise(r => server.close(r)); await cleanup(); }
});
module.exports = { parseCsv };
