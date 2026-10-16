const { randomUUID, createHash } = require('crypto');
const { Notification, NotificationWork } = require('../models/Notification');
const Academic = require('../models/Academic');
const Account = require('../models/Account');
const Student = require('../models/Student'), Teacher = require('../models/Teacher');
const Analytics = require('./attendanceAnalyticsService');
const Calculation = require('./attendanceCalculation');
const A = require('./academicService');
const sources = [...Object.values(Academic), Account];
const same = (a, b) => String(a?._id || a) === String(b?._id || b);
const activeInterval = (rows, field, id, day) => rows.some(r => same(r[field], id) && A.during(r, day));

async function enqueue(offeringId) {
    try {
        await NotificationWork.updateOne({ offeringId }, { $inc: { requested: 1 }, $set: { pending: true, nextAttemptAt: new Date(0) } }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
        await NotificationWork.updateOne({ offeringId }, { $inc: { requested: 1 }, $set: { pending: true, nextAttemptAt: new Date(0) } });
    }
}
function offeringFilter(model, source) {
    if (model === Academic.CourseOffering) return { _id: source._id };
    if (model === Academic.LectureSession) return { _id: source.offeringId };
    if (model === Academic.AcademicTerm) return { termId: source._id };
    if (model === Academic.Course) return { courseId: source._id };
    if (model === Academic.ClassGroup) return { classGroupId: source._id };
    const clauses = [];
    if (source.studentProfileId) clauses.push({ 'enrolments.studentId': source.studentProfileId });
    if (source.teacherProfileId) clauses.push({ 'assignments.teacherId': source.teacherProfileId });
    return clauses.length ? { $or: clauses } : { _id: null };
}
// Fan-out is resumable: source marker is acknowledged ONLY after every affected job is durable.
// Repeating fan-out after a crash is safe. No transaction or external queue is required.
async function dispatch(limit = 25) {
    let dispatched = 0;
    for (const model of sources) {
        const docs = await model.find({ alertsDirty: true }).select('_id offeringId studentProfileId teacherProfileId +alertsChange +alertsCursor').sort({ _id: 1 }).limit(limit).lean();
        for (const doc of docs) {
            let filter = offeringFilter(model, doc);
            if (model === Account) {
                const previous = await Notification.distinct('offeringId', { recipientId: doc._id });
                filter = { $or: [filter, { _id: { $in: previous } }] };
            }
            if (doc.alertsCursor) filter = { $and: [filter, { _id: { $gt: doc.alertsCursor } }] };
            const batch = await Academic.CourseOffering.find(filter).select('_id').sort({ _id: 1 }).limit(50).lean();
            for (const o of batch) await enqueue(o._id);
            await model.collection.updateOne({ _id: doc._id, alertsChange: doc.alertsChange }, { $set: { alertsDirty: batch.length === 50, alertsCursor: batch.at(-1)?._id || null } });
            dispatched++;
        }
    }
    return dispatched;
}
async function sourceStamp(offering) {
    const docs = await Promise.all([
        Academic.CourseOffering.collection.findOne({ _id: offering._id }, { projection: { alertsChange: 1 } }),
        ...[[Academic.AcademicTerm, offering.termId], [Academic.Course, offering.courseId], [Academic.ClassGroup, offering.classGroupId]].map(([model, id]) => model.collection.findOne({ _id: id }, { projection: { alertsChange: 1 } }))
    ]);
    const hash = createHash('sha256').update(JSON.stringify(docs));
    const cursors = [
        Academic.LectureSession.collection.find({ offeringId: offering._id }, { projection: { alertsChange: 1, revision: 1 } }).sort({ _id: 1 }).batchSize(200),
        Account.collection.find({ $or: [{ studentProfileId: { $in: offering.enrolments.map(e => e.studentId) } }, { teacherProfileId: { $in: offering.assignments.map(e => e.teacherId) } }] }, { projection: { alertsChange: 1, role: 1, isActive: 1, studentProfileId: 1, teacherProfileId: 1 } }).sort({ _id: 1 }).batchSize(200)
    ];
    try { for (const cursor of cursors) { hash.update('|'); for await (const doc of cursor) hash.update(JSON.stringify(doc)); } }
    finally { await Promise.all(cursors.map(c => c.close())); }
    return hash.digest('hex');
}
async function evaluate(offeringId, now = new Date()) {
    const o = await Academic.CourseOffering.findById(offeringId).lean();
    if (!o) return { entries: [], stamp: null, offering: null };
    const stamp = await sourceStamp(o), day = A.campusDate(now);
    const [term, course, group, accounts, students, teachers, previous] = await Promise.all([
        Academic.AcademicTerm.findById(o.termId).lean(), Academic.Course.findById(o.courseId).select('state').lean(), Academic.ClassGroup.findById(o.classGroupId).select('state').lean(),
        Account.find({ isActive: true, $or: [{ role: 'student', studentProfileId: { $in: o.enrolments.map(e => e.studentId) } }, { role: 'teacher', teacherProfileId: { $in: o.assignments.map(e => e.teacherId) } }] }).select('_id role studentProfileId teacherProfileId').lean(),
        Student.distinct('_id', { _id: { $in: o.enrolments.map(e => e.studentId) } }), Teacher.distinct('_id', { _id: { $in: o.assignments.map(e => e.teacherId) } }),
        Notification.find({ offeringId: o._id }).select('recipientId studentId scope').lean()
    ]);
    const academicActive = o.state === 'active' && [term, course, group].every(x => x?.state === 'active');
    const entries = [];
    if (academicActive) {
        // Reuse the actual shared calculation, without a temporary analytics/date filter.
        const full = await Analytics.calculate({ userRole: 'admin' }, { offeringId: String(o._id) }, false);
        const empty = calculated => Calculation.result(Calculation.emptyCounts(), term.minimumAttendancePercent ?? 75, calculated.courses.some(c => c.unknownRosterSessions > 0));
        for (const account of accounts) {
            if (account.role === 'student' && students.some(id => same(id, account.studentProfileId)) && activeInterval(o.enrolments, 'studentId', account.studentProfileId, day)) {
                const metric = full.rows.find(r => same(r.studentId, account.studentProfileId)) || empty(full);
                entries.push({ account, studentId: account.studentProfileId, scope: 'student', metric });
            }
            if (account.role === 'teacher' && teachers.some(id => same(id, account.teacherProfileId)) && activeInterval(o.assignments, 'teacherId', account.teacherProfileId, day)) {
                const taught = await Analytics.calculate({ userRole: 'teacher', teacherId: account.teacherProfileId }, { offeringId: String(o._id) }, false);
                const metrics = new Map(taught.rows.map(r => [String(r.studentId), r]));
                for (const n of previous) if (same(n.recipientId, account._id) && n.scope === 'teacher:' + account.teacherProfileId && !metrics.has(String(n.studentId))) metrics.set(String(n.studentId), { studentId: n.studentId, ...empty(taught) });
                for (const metric of metrics.values()) {
                    if (students.some(id => same(id, metric.studentId)) && activeInterval(o.enrolments, 'studentId', metric.studentId, day)) entries.push({ account, studentId: metric.studentId, teacherId: account.teacherProfileId, scope: 'teacher:' + account.teacherProfileId, metric });
                }
            }
        }
    }
    return { entries, offering: o, stamp, academicActive, term, evaluatedAt: now };
}
function lifecycle(previous, metric, reason) {
    const unavailable = !reason && (!metric || metric.belowMinimum === null);
    const low = !reason && metric?.belowMinimum === true;
    if ((!previous || previous.hasAlert === false) && !low) return null;
    const status = low ? 'active' : unavailable ? 'unavailable' : 'resolved';
    const snapshot = reason ? previous : metric;
    const wasOpen = previous?.episodeOpen ?? (previous?.status === 'active' || previous?.status === 'unavailable');
    return {
        hasAlert: true, status, reason: reason || (unavailable ? (metric?.dataQuality ? 'Evaluation unavailable: incomplete attendance data.' : metric?.status || 'No completed sessions') : low ? 'Below the term minimum' : 'Attendance meets the term minimum'),
        episodeOpen: low || unavailable && wasOpen,
        // Only a new low-attendance episode makes a notification unread again.
        readAt: low && !wasOpen ? null : previous?.readAt || null,
        resolvedAt: status === 'resolved' ? previous?.status === 'resolved' ? previous.resolvedAt : new Date() : null,
        percentage: snapshot?.percentage ?? null,
        attended: snapshot?.attended ?? null, eligible: snapshot?.eligible ?? null,
        present: snapshot?.present ?? null, late: snapshot?.late ?? null, absent: snapshot?.absent ?? null,
        minimum: metric ? metric.minimum : previous?.minimum ?? null
    };
}
async function applyEvaluation(plan, version, stillOwned = async () => true) {
    if (!plan.offering || await sourceStamp(plan.offering) !== plan.stamp) return false;
    const existing = await Notification.find({ offeringId: plan.offering._id }).lean();
    const key = e => `${e.recipientId || e.account._id}:${e.studentId}:${e.scope}`;
    const previousByKey = new Map(existing.map(e => [key(e), e]));
    const entries = new Map(plan.entries.map(e => [key(e), e]));
    for (const old of existing) if (!entries.has(key(old))) entries.set(key(old), {
        ...old, reason: plan.academicActive ? 'Recipient inactive, profile unavailable, or effective enrolment/assignment ended.' : 'Offering or academic structure archived or unavailable.'
    });
    for (const [k, entry] of entries) {
        if (!await stillOwned()) return false;
        const previous = previousByKey.get(k), next = lifecycle(previous, entry.metric, entry.reason);
        const identity = { recipientId: entry.account?._id || entry.recipientId, type: 'low-attendance', studentId: entry.studentId, offeringId: plan.offering._id, scope: entry.scope };
        if (!next) {
            // Persist a fence without attendance figures or a delivered message. Otherwise an
            // expired worker paused before its first insert could create a stale warning later.
            try { await Notification.updateOne({ ...identity, hasAlert: false, evaluationVersion: { $lt: version } }, { $set: {
                recipientRole: entry.account?.role || entry.recipientRole, termId: plan.offering.termId, teacherId: entry.teacherId,
                hasAlert: false, status: 'dormant', evaluatedAt: plan.evaluatedAt, evaluationVersion: version
            } }, { upsert: true }); } catch (e) {
                if (e.code !== 11000) throw e;
                // A real warning may have been inserted between our read and this fence.
                // Resolve/suspend it atomically instead of erasing its authorised history.
                const recovery = lifecycle({ hasAlert: true, status: 'active', episodeOpen: true }, entry.metric, entry.reason);
                delete recovery.readAt;
                if (entry.reason) for (const field of ['percentage', 'attended', 'eligible', 'present', 'late', 'absent', 'minimum']) delete recovery[field];
                await Notification.updateOne({ ...identity, hasAlert: { $ne: false }, evaluationVersion: { $lt: version } }, { $set: {
                    ...recovery, evaluatedAt: plan.evaluatedAt, ...(entry.metric ? { snapshotAt: plan.evaluatedAt } : {}), evaluationVersion: version
                } });
            }
            continue;
        }
        const values = { ...next, recipientRole: entry.account?.role || entry.recipientRole, termId: plan.offering.termId, teacherId: entry.teacherId,
            evaluatedAt: plan.evaluatedAt, snapshotAt: entry.metric ? plan.evaluatedAt : previous?.snapshotAt, evaluationVersion: version };
        if (!previous || previous.hasAlert === false) values.firstAlertAt = plan.evaluatedAt;
        if (!previous) {
            // Unique-key upsert plus fencing also covers two workers racing on the first insert.
            delete values.readAt;
            try { await Notification.updateOne({ ...identity, evaluationVersion: { $lt: version } }, { $set: values, $setOnInsert: { readAt: null } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; }
        } else {
            // Fencing prevents an expired worker from overwriting a newer evaluation.
            // readAt is a separate user-owned state: never overwrite a concurrent mark-read.
            const wasOpen = previous.episodeOpen ?? (previous.status === 'active' || previous.status === 'unavailable');
            if (!(next.status === 'active' && !wasOpen)) delete values.readAt;
            await Notification.updateOne({ _id: previous._id, evaluationVersion: { $lt: version } }, { $set: values });
        }
    }
    return true;
}
async function processOne() {
    const now = new Date(), token = randomUUID();
    const job = await NotificationWork.findOneAndUpdate({ pending: true, nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: null }] },
        { $set: { lease: token, leaseUntil: new Date(+now + 120000) }, $inc: { fence: 1 } }, { new: true, sort: { nextAttemptAt: 1, _id: 1 } }).lean();
    if (!job) return false;
    const owns = () => NotificationWork.exists({ _id: job._id, lease: token, requested: job.requested, leaseUntil: { $gt: new Date() } });
    try {
        await require('./correctionService').reconcileOffering(job.offeringId);
        const plan = await evaluate(job.offeringId);
        let applied = false;
        if (await owns()) {
            if (plan.offering) applied = await applyEvaluation(plan, job.fence, owns);
            else {
                // Orphaned work must not retry forever if a record was removed outside this app.
                await Notification.updateMany({ offeringId: job.offeringId, evaluationVersion: { $lt: job.fence } }, { $set: {
                    status: 'resolved', episodeOpen: false, reason: 'Course offering unavailable.', resolvedAt: new Date(), evaluatedAt: new Date(), evaluationVersion: job.fence
                } });
                applied = true;
            }
        }
        if (!applied) {
            await NotificationWork.updateOne({ _id: job._id, lease: token }, { $set: { pending: true, leaseUntil: new Date(0), nextAttemptAt: new Date(0) } });
            return true;
        }
        await NotificationWork.updateOne({ _id: job._id, lease: token, requested: job.requested }, { $set: { pending: false, completed: job.requested, leaseUntil: new Date(0), attempts: 0, lastFailure: null, lastSuccessAt: new Date(), campusDay: A.campusDate(new Date()) } });
        // A trigger arriving during completion is left pending by its own atomic update.
        await NotificationWork.updateOne({ _id: job._id, lease: token, requested: { $ne: job.requested } }, { $set: { leaseUntil: new Date(0) } });
    } catch (error) {
        await NotificationWork.updateOne({ _id: job._id, lease: token }, { $set: { pending: true, leaseUntil: new Date(0), lastFailure: 'Reconciliation failed. Check database availability and attendance validity.', lastFailedAt: new Date(), nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** Math.min(job.attempts, 9))) }, $inc: { attempts: 1 } });
    }
    return true;
}
async function tick() {
    await dispatch();
    const day = A.campusDate(new Date());
    // Only previously enrolled work is refreshed automatically; initial backfill is explicit.
    await NotificationWork.updateMany({ pending: false, campusDay: { $ne: day } }, { $set: { pending: true, nextAttemptAt: new Date(0) }, $inc: { requested: 1 } });
    for (let i = 0; i < 10; i++) if (!await processOne()) break;
}
function startWorker() {
    let stopped = false, timer, running;
    const run = async () => {
        if (stopped) return;
        try { running = tick(); await running; } catch { console.error('Notification reconciliation deferred; durable work will retry.'); }
        finally { if (!stopped) { timer = setTimeout(run, 5000); timer.unref(); } }
    };
    run();
    return async () => { stopped = true; clearTimeout(timer); await running?.catch(() => {}); };
}
module.exports = { enqueue, dispatch, evaluate, applyEvaluation, lifecycle, processOne, tick, startWorker };
