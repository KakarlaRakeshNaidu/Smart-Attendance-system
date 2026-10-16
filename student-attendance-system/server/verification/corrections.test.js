const { test } = require('node:test'), assert = require('node:assert/strict');
const { seedAnalytics, cleanup, password } = require('./analyticsFixtures');
const { LectureSession, CourseOffering } = require('../src/models/Academic');
const Account = require('../src/models/Account');
const { Notification, NotificationWork } = require('../src/models/Notification');
const R = require('../src/services/notificationReconciliation');
test('Correction eligibility preserves saved-roster and marking-provenance requirements without database reads', () => {
    const { eligibility } = require('../src/services/correctionService');
    const studentId = '111111111111111111111111';
    const session = { state: 'completed', finalised: true, attendanceStarted: true,
        roster: [{ studentId }], records: [{ studentId, status: 'absent', markedAt: new Date('2026-06-01T04:30:00Z'), method: 'manual' }] };
    assert.equal(eligibility(session, studentId).available, true);
    for (const field of [{ markedAt: undefined }, { markedAt: 'invalid' }, { method: 'unknown' }, { correctionRevision: -1 }]) {
        const result = eligibility({ ...session, records: [{ ...session.records[0], ...field }] }, studentId);
        assert.equal(result.available, false); assert.match(result.reason, /incomplete or inconsistent/);
    }
    assert.equal(eligibility({ ...session, records: [...session.records, session.records[0]] }, studentId).available, false);
    assert.equal(eligibility(session, '222222222222222222222222').available, false);
    assert.equal(eligibility({ ...session, finalised: false }, studentId).available, false);
    assert.equal(eligibility({ ...session, state: 'cancelled' }, studentId).available, false);
});
test('Attendance corrections: eligibility, review scope, atomic audit and recovery', async t => {
    const d = await seedAnalytics(), { fx } = d; let server;
    try {
        await Promise.all([Notification.init(), NotificationWork.init()]);
        const other = new Account({ name: 'ISOLATED Other Student', email: fx.otherStudent.email, role: 'student', studentProfileId: fx.otherStudent.id, isActive: true });
        await other.setPassword(password); await other.save(); fx.users.otherStudent = other;
        const build = await require('mongoose').connection.db.command({ buildInfo: 1 }); t.diagnostic('MongoDB ' + build.version + '; correction decisions use one document, without transactions.');
        server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
        const base = 'http://127.0.0.1:' + server.address().port + '/api', tokens = {};
        for (const role of ['student', 'otherStudent', 'teacher', 'otherTeacher', 'admin']) {
            const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fx.users[role].email, password }) });
            assert.equal(res.status, 200); tokens[role] = (await res.json()).token;
        }
        async function req(path, role = 'student', method = 'GET', body) {
            const res = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + tokens[role], 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: res.status, data: await res.json() };
        }
        function ok(result, status = 200) { assert.equal(result.status, status, result.data.message); return result.data; }
        const sessionPath = s => '/corrections/sessions/' + s._id;
        const requestPath = r => '/corrections/sessions/' + r.sessionId + '/requests/' + r.id;
        const submit = async (s, status = 'present', role = 'student') => ok(await req(sessionPath(s), role, 'POST', { requestedStatus: status, reason: 'ISOLATED Please review the recorded mark.' }), 201).item;
        const action = (r, action, role = 'teacher', body = { reason: 'ISOLATED Reviewed against lecture evidence.' }) => req(requestPath(r) + '/' + action, role, 'POST', body);
        const stored = s => LectureSession.findById(s._id).select('+correctionSlots +correctionAudit +hasOpenCorrections');
        let day = 1;
        const lecture = (extra = {}) => d.lecture(d.primary, '2026-06-' + String(day++).padStart(2, '0') + 'T04:30:00Z', ['absent', 'absent'], extra);
        async function drain() { await R.dispatch(100); for (let i = 0; i < 100; i++) if (!await R.processOne()) return; assert.fail('Reconciliation did not drain'); }
        let first, secondary;
        await t.test('Own finalised request captures server status, revision and historical eligibility', async () => {
            secondary = await LectureSession.findOne({ offeringId: d.secondary.id });
            await drain();
            first = await submit(secondary, 'late'); assert.equal(first.originalStatus, 'absent'); assert.equal(first.state, 'pending_teacher');
            const s = await stored(secondary); assert.equal(s.correctionSlots.get(fx.student.id).current.originalEntryRevision, 0);
            assert.equal(s.correctionSlots.get(fx.student.id).history.length, 0);
            const context = ok(await req(sessionPath(secondary))); assert.equal(context.pending.id, first.id); assert.equal(context.eligibility.available, false);
            const ownHistory = ok(await req('/student-portal/attendance?offeringId=' + d.secondary.id)); assert.equal(ownHistory.items[0].correctionPendingId, first.id);
        });
        await t.test('Other Students/Teachers cannot read or act; Admin cannot bypass ordinary Teacher review', async () => {
            assert.equal((await req(requestPath(first), 'otherStudent')).status, 403);
            assert.equal((await req(requestPath(first), 'otherTeacher')).status, 403);
            assert.equal((await action(first, 'approve', 'student')).status, 403);
            assert.equal((await action(first, 'approve', 'otherTeacher')).status, 403);
            assert.equal((await action(first, 'approve', 'admin')).status, 403);
            assert.equal(ok(await req('/corrections?queue=actionable', 'admin')).pagination.total, 0);
            assert.equal(ok(await req('/corrections', 'otherStudent')).pagination.total, 0);
        });
        await t.test('Approval preserves provenance, atomically appends audit and updates shared analytics/notifications', async () => {
            const original = secondary.records[0].toObject(), otherMarks = JSON.stringify(secondary.records.slice(1));
            const approved = ok(await action(first, 'approve')).item; assert.equal(approved.state, 'approved'); assert.equal(approved.audit.length, 1);
            const s = await stored(secondary); assert.equal(s.records[0].status, 'late'); assert.deepEqual(s.records[0].markedAt, original.markedAt); assert.equal(s.records[0].method, original.method);
            assert.ok(s.records[0].correctedAt); assert.equal(s.records[0].correctionRevision, 1); assert.equal(JSON.stringify(s.records.slice(1)), otherMarks);
            const audit = s.correctionAudit[0]; assert.equal(audit.actorId.toString(), fx.users.teacher.id); assert.equal(audit.previousStatus, 'absent'); assert.equal(audit.newStatus, 'late'); assert.ok(audit.at); assert.equal(audit.sessionRevision, s.revision);
            const analytics = ok(await req('/analytics/student?offeringId=' + d.secondary.id)); assert.equal(analytics.summary.attended, 1); assert.equal(analytics.summary.eligible, 1);
            await drain(); const notification = await Notification.findOne({ recipientId: fx.users.student.id, offeringId: d.secondary.id, hasAlert: true }); assert.equal(notification.status, 'resolved');
            const before = s.revision; ok(await action(first, 'approve')); assert.equal((await stored(secondary)).revision, before); assert.equal((await stored(secondary)).correctionAudit.length, 1);
            const exported = await fetch(base + '/academic/sessions/' + secondary.id + '/export', { headers: { Authorization: 'Bearer ' + tokens.teacher } });
            assert.equal(exported.status, 200); const csv = await exported.text(); assert.ok(csv.includes('late')); assert.ok(csv.includes(fx.student.studentId));
        });
        await t.test('Same/invalid status, private fields, short reasons and missing review reasons are rejected', async () => {
            const s = await lecture();
            for (const body of [{ requestedStatus: 'absent', reason: 'Same status is invalid' }, { requestedStatus: 'excused', reason: 'Invalid unsupported status' }, { requestedStatus: 'present', reason: 'bad' }, { requestedStatus: 'present', reason: 'Valid reason', studentId: fx.otherStudent.id }, { requestedStatus: 'present', reason: 'Valid reason', originalStatus: 'present' }]) assert.equal((await req(sessionPath(s), 'student', 'POST', body)).status, 400);
            const r = await submit(s); assert.equal((await action(r, 'approve', 'teacher', {})).status, 400);
            assert.equal((await action(r, 'approve', 'teacher', { reason: 'Valid reason', reviewerId: fx.users.admin.id })).status, 400);
        });
        await t.test('Concurrent unresolved submissions occupy exactly one database slot', async () => {
            const s = await lecture(); const results = await Promise.all(Array.from({ length: 6 }, () => req(sessionPath(s), 'student', 'POST', { requestedStatus: 'present', reason: 'ISOLATED duplicate submission check.' })));
            assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(results.filter(r => r.status === 409).length, 5);
            const doc = await stored(s); assert.equal(doc.correctionSlots.size, 1); assert.equal(doc.correctionSlots.get(fx.student.id).history.length, 0);
        });
        await t.test('Cancelled/unfinalised/ineligible/corrupt and unmapped legacy records cannot be requested', async () => {
            for (const extra of [{ state: 'cancelled' }, { finalised: false }, { state: 'scheduled', finalised: false }, { records: [] }, { roster: [] }]) {
                const s = await lecture(extra); assert.equal((await req(sessionPath(s), 'student', 'POST', { requestedStatus: 'present', reason: 'ISOLATED eligibility test.' })).status, extra.roster ? 403 : 409);
            }
            const corrupt = await lecture(); await LectureSession.updateOne({ _id: corrupt.id }, { $push: { records: corrupt.records[0].toObject() } });
            assert.equal((await req(sessionPath(corrupt), 'student', 'POST', { requestedStatus: 'late', reason: 'ISOLATED duplicate mark check.' })).status, 409);
            const missingProvenance = await lecture(); await LectureSession.collection.updateOne({ _id: missingProvenance._id }, { $unset: { 'records.0.markedAt': '' } });
            assert.equal((await req(sessionPath(missingProvenance), 'student', 'POST', { requestedStatus: 'late', reason: 'ISOLATED missing provenance check.' })).status, 409);
            assert.equal((await req('/corrections/sessions/' + d.legacy.id, 'student', 'POST', { requestedStatus: 'late', reason: 'Unmapped legacy is unavailable.' })).status, 404);
            assert.equal((await req(sessionPath(secondary), 'otherStudent', 'POST', { requestedStatus: 'late', reason: 'Student is outside this roster.' })).status, 403);
        });
        await t.test('Rejection and withdrawal keep attendance unchanged and terminal history append-only', async () => {
            const s = await lecture(), r = await submit(s), before = JSON.stringify((await stored(s)).records);
            const rejected = ok(await action(r, 'reject')).item; assert.equal(rejected.state, 'rejected'); assert.equal(JSON.stringify((await stored(s)).records), before);
            const next = await submit(s, 'late'); const withdrawn = ok(await action(next, 'withdraw', 'student', {})).item; assert.equal(withdrawn.state, 'withdrawn');
            assert.equal(JSON.stringify((await stored(s)).records), before); assert.equal((await stored(s)).correctionSlots.get(fx.student.id).history.length, 2);
            assert.equal((await action(r, 'approve')).status, 409); assert.equal((await req(requestPath(r), 'teacher', 'PATCH', { state: 'approved' })).status, 404);
            assert.equal((await req(requestPath(r), 'admin', 'DELETE')).status, 404);
        });
        await t.test('Explicit escalation permits Admin review, without granting general marking rights', async () => {
            const s = await lecture(), r = await submit(s); const escalated = ok(await action(r, 'escalate')).item; assert.equal(escalated.state, 'escalated_admin'); assert.match(escalated.routeReason, /Reviewed/);
            assert.equal((await action(r, 'approve')).status, 403); const approved = ok(await action(r, 'approve', 'admin')).item; assert.equal(approved.reviewerRole, 'admin'); assert.equal(approved.audit[0].actorRole, 'admin');
            assert.equal((await req('/academic/sessions/' + s.id + '/attendance', 'admin', 'POST', { records: [] })).status, 403);
            assert.equal((await req('/academic/sessions/' + s.id + '/attendance', 'teacher', 'DELETE')).status, 409);
        });
        await t.test('Inactive or ended Teacher authority routes to Admin, retaining Teacher historical reads only', async () => {
            const s = await lecture();
            await Account.updateOne({ _id: fx.users.teacher.id }, { $set: { isActive: false } });
            const r = await submit(s); assert.equal(r.state, 'escalated_admin'); assert.match(r.routeReason, /active linked account/);
            assert.equal((await action(r, 'approve')).status, 401); ok(await action(r, 'reject', 'admin'));
            await Account.updateOne({ _id: fx.users.teacher.id }, { $set: { isActive: true } });
            const s2 = await lecture(), r2 = await submit(s2);
            await CourseOffering.updateOne({ _id: d.primary.id, 'assignments.teacherId': fx.teacher.id }, { $set: { 'assignments.$.endDate': '2026-07-01' } });
            assert.equal(ok(await req(requestPath(r2), 'teacher')).item.canReview, false);
            assert.equal((await action(r2, 'approve')).status, 403);
            const queue = ok(await req('/corrections?queue=actionable', 'admin')); assert.ok(queue.items.some(r => r.id === r2.id));
            await require('../src/services/correctionService').reconcileOffering(d.primary.id);
            assert.equal((await stored(s2)).correctionSlots.get(fx.student.id).current.state, 'escalated_admin');
            ok(await action(r2, 'approve', 'admin'));
            await CourseOffering.updateOne({ _id: d.primary.id, 'assignments.teacherId': fx.teacher.id }, { $set: { 'assignments.$.endDate': '2030-12-31' } });
        });
        await t.test('Two reviewers and approval-versus-withdrawal have one valid winner', async () => {
            const s = await lecture(), r = await submit(s);
            const results = await Promise.all([action(r, 'approve'), action(r, 'reject')]); assert.equal(results.filter(r => r.status === 200).length, 1); assert.equal(results.filter(r => r.status === 409).length, 1);
            const slot = (await stored(s)).correctionSlots.get(fx.student.id); assert.equal(slot.history.length, 1); assert.ok(!slot.current);
            const s2 = await lecture(), r2 = await submit(s2), race = await Promise.all([action(r2, 'approve'), action(r2, 'withdraw', 'student', {})]);
            assert.equal(race.filter(r => r.status === 200).length, 1); assert.equal(race.filter(r => r.status === 409).length, 1);
            const saved = await stored(s2); assert.equal(saved.correctionSlots.get(fx.student.id).history.length, 1); assert.equal((saved.correctionAudit || []).length, saved.records[0].status === 'present' ? 1 : 0);
        });
        await t.test('Target changes become stale; unrelated valid entry changes do not invalidate a request', async () => {
            const s = await lecture(), r = await submit(s);
            await LectureSession.updateOne({ _id: s.id }, { $set: { 'records.0.status': 'late' } });
            const stale = await action(r, 'approve'); assert.equal(stale.status, 409); assert.equal(stale.data.item.state, 'stale'); assert.equal(stale.data.item.currentStatus, 'late'); assert.equal((await stored(s)).records[0].status, 'late');
            const s2 = await lecture(), r2 = await submit(s2); await LectureSession.updateOne({ _id: s2.id }, { $set: { 'records.1.status': 'late' }, $inc: { revision: 1 } });
            ok(await action(r2, 'approve')); assert.equal((await stored(s2)).records[1].status, 'late');
        });
        await t.test('Lost approval response is recoverable with one audit; failed pre-write cannot claim approval', async () => {
            const s = await lecture(), r = await submit(s), original = LectureSession.findOneAndUpdate;
            let inject = true;
            LectureSession.findOneAndUpdate = function (...args) {
                const query = original.apply(this, args), exec = query.exec;
                if (inject && args[1].$set?.correctionAudit) { inject = false; query.exec = async function (...params) { const result = await exec.apply(this, params); if (result) throw new Error('ISOLATED lost response after commit'); return result; }; }
                return query;
            };
            try { assert.equal((await action(r, 'approve')).status, 500); } finally { LectureSession.findOneAndUpdate = original; }
            assert.equal((await stored(s)).records[0].status, 'present'); const revision = (await stored(s)).revision;
            ok(await action(r, 'approve')); assert.equal((await stored(s)).correctionAudit.length, 1); assert.equal((await stored(s)).revision, revision);
            const s2 = await lecture(), r2 = await submit(s2); inject = true;
            LectureSession.findOneAndUpdate = function (...args) { const query = original.apply(this, args); if (inject && args[1].$set?.correctionAudit) { inject = false; query.exec = async () => { throw new Error('ISOLATED interruption before write'); }; } return query; };
            try { assert.equal((await action(r2, 'approve')).status, 500); } finally { LectureSession.findOneAndUpdate = original; }
            const beforeRetry = await stored(s2); assert.equal(beforeRetry.records[0].status, 'absent'); assert.equal(beforeRetry.correctionSlots.get(fx.student.id).current.state, 'pending_teacher'); assert.equal((beforeRetry.correctionAudit || []).length, 0);
            ok(await action(r2, 'approve')); assert.equal((await stored(s2)).correctionAudit.length, 1);
        });
        await t.test('Notification outage does not undo a committed correction and dirty work retries', async () => {
            const r = await submit(secondary, 'absent'), original = NotificationWork.updateOne;
            NotificationWork.updateOne = () => Promise.reject(new Error('ISOLATED notification outage'));
            try { ok(await action(r, 'approve')); await assert.rejects(() => R.dispatch(100)); } finally { NotificationWork.updateOne = original; }
            assert.equal((await stored(secondary)).records[0].status, 'absent'); assert.equal((await stored(secondary)).correctionAudit.length, 2);
            assert.equal((await LectureSession.collection.findOne({ _id: secondary._id })).alertsDirty, true);
            await drain(); assert.equal((await Notification.findOne({ recipientId: fx.users.student.id, offeringId: d.secondary.id, hasAlert: true })).status, 'active');
        });
        await t.test('Queue filtering/pagination/deep links remain scoped and responses contain no classmates or secrets', async () => {
            const student = ok(await req('/corrections?limit=1&page=2&sort=oldest')); assert.equal(student.items.length, 1); assert.equal(student.pagination.page, 2);
            const filtered = ok(await req('/corrections?offeringId=' + d.secondary.id + '&from=2026-02-10&to=2026-02-10&state=approved')); assert.equal(filtered.pagination.total, 2);
            for (const q of ['limit=101', 'page=0', 'state=anything', 'from=2026-99-99', 'from=2026-06-02&to=2026-06-01', 'studentId=' + fx.otherStudent.id, 'sort=no']) assert.equal((await req('/corrections?' + q)).status, 400);
            const json = JSON.stringify(ok(await req('/corrections')));
            assert.ok(!json.includes(fx.otherStudent.id));
            for (const key of ['passwordHash', 'activationToken', 'faceEmbedding', 'originalFingerprint', 'records', 'roster', 'submittedBy', 'reviewerId']) assert.ok(!json.includes('"' + key + '"'), key + ' leaked');
            const s = await lecture(), r = await submit(s, 'late', 'otherStudent'); assert.equal((await req(requestPath(r), 'student')).status, 404);
            const apiSession = ok(await req('/academic/sessions/' + s.id)); assert.ok(!JSON.stringify(apiSession).includes('correctionSlots'));
        });
        await t.test('Two Students can have concurrent approved corrections without losing either audit', async () => {
            const s = await lecture(), a = await submit(s), b = await submit(s, 'late', 'otherStudent');
            const results = await Promise.all([action(a, 'approve'), action(b, 'approve')]); results.forEach(r => ok(r));
            const saved = await stored(s); assert.deepEqual(saved.records.map(m => m.status), ['present', 'late']); assert.equal(saved.correctionAudit.length, 2);
            assert.equal(saved.correctionSlots.get(fx.student.id).history.length, 1); assert.equal(saved.correctionSlots.get(fx.otherStudent.id).history.length, 1); assert.equal(saved.hasOpenCorrections, false);
        });
        await t.test('Cancellation reconciles pending requests as stale; archived structures route review to Admin', async () => {
            const s = await lecture(), r = await submit(s), before = JSON.stringify((await stored(s)).records);
            ok(await req('/academic/sessions/' + s.id, 'admin', 'PATCH', { state: 'cancelled', cancellationReason: 'ISOLATED cancelled lecture' }));
            await require('../src/services/correctionService').reconcileOffering(d.primary.id);
            const item = ok(await req(requestPath(r))).item; assert.equal(item.state, 'stale'); assert.equal(item.reviewerRole, 'system'); assert.equal(item.canWithdraw, false);
            assert.equal(JSON.stringify((await stored(s)).records), before); assert.equal((await stored(s)).correctionAudit?.length || 0, 0);
            const s2 = await lecture();
            await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { state: 'archived' } });
            try { const r2 = await submit(s2); assert.equal(r2.state, 'escalated_admin'); assert.match(r2.routeReason, /archived/); assert.equal((await action(r2, 'approve')).status, 403); ok(await action(r2, 'approve', 'admin')); }
            finally { await CourseOffering.updateOne({ _id: d.primary.id }, { $set: { state: 'active' } }); }
        });
        await t.test('Malformed stored slot ownership cannot expose a classmate through context, queues or details', async () => {
            const s = await lecture(), r = await submit(s), path = 'correctionSlots.' + fx.student.id + '.current';
            const original = (await stored(s)).correctionSlots.get(fx.student.id).current.toObject();
            await LectureSession.collection.updateOne({ _id: s._id }, { $set: { [path + '.studentId']: fx.otherStudent._id } });
            try {
                assert.equal((await req(sessionPath(s))).status, 409);
                assert.equal((await req(requestPath(r))).status, 404);
                assert.equal((await action(r, 'withdraw', 'student', {})).status, 404);
                assert.ok(!ok(await req('/corrections')).items.some(x => x.id === r.id));
            } finally { await LectureSession.collection.updateOne({ _id: s._id }, { $set: { [path]: original } }); }
        });
    } finally { if (server) await new Promise(r => server.close(r)); await cleanup(); }
});
