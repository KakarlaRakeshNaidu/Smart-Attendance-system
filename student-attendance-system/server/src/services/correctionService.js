const { createHash } = require('crypto');
const { Types } = require('mongoose');
const { LectureSession } = require('../models/Academic');
const Student = require('../models/Student');
const A = require('./academicService');
const C = require('./attendanceCalculation');
const Q = require('./correctionQuery');
const projection = '+correctionSlots +correctionAudit +hasOpenCorrections';
const supported = ['present', 'absent', 'late'];
const unresolved = r => ['pending_teacher', 'escalated_admin'].includes(r.state);
const same = (a, b) => String(a) === String(b);
const plain = v => v?.toObject ? v.toObject({ flattenMaps: true }) : v;
const slotsOf = s => Object.fromEntries([...(s.correctionSlots || new Map())].map(([k, v]) => [k, plain(v)]));
function body(value, allowed) {
    if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !allowed.includes(k))) A.fail(400, 'Only the permitted correction fields may be submitted.');
}
function reason(value) {
    if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 1000 || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) A.fail(400, 'Provide a plain-text reason of 5–1000 characters.');
    return value.trim();
}
function eligibility(session, studentId) {
    if (session.state !== 'completed' || !session.finalised) return { available: false, reason: 'Corrections require a completed, finalised lecture; cancelled lectures cannot be corrected.' };
    const checked = C.inspectSession(session);
    if (!checked || checked.unknownRoster || checked.extraMarks || checked.opportunities.some(o => !o.valid) || session.records.some(m =>
        !m.markedAt || Number.isNaN(new Date(m.markedAt).getTime()) || !['manual', 'face', 'photo', 'finalisation', 'legacy'].includes(m.method) ||
        !Number.isSafeInteger(m.correctionRevision ?? 0) || (m.correctionRevision ?? 0) < 0)) return { available: false, reason: 'Finalised attendance is incomplete or inconsistent. Staff must investigate; no attendance entry will be invented.' };
    if (!checked.opportunities.some(o => same(o.studentId, studentId))) return { available: false, reason: 'You are not in this lecture’s saved eligible roster.' };
    return { available: true, reason: '' };
}
const fingerprint = mark => createHash('sha256').update(JSON.stringify([String(mark.studentId), mark.status, new Date(mark.markedAt).toISOString(), mark.method, mark.correctionRevision || 0])).digest('hex');
function currentMark(s, studentId) { const marks = s.records.filter(m => same(m.studentId, studentId)); return marks.length === 1 ? marks[0] : null; }
function staleReason(s, r) {
    const eligible = eligibility(s, r.studentId);
    if (!eligible.available) return eligible.reason;
    if (fingerprint(currentMark(s, r.studentId)) !== r.originalFingerprint) return 'Your attendance entry changed after submission. Review its current status before submitting another request.';
    return '';
}
function locate(s, requestId, mine = null) {
    for (const [key, slot] of Object.entries(slotsOf(s))) {
        if (mine && key !== mine) continue;
        if (slot.current && same(slot.current._id, requestId)) {
            if (mine && !same(slot.current.studentId, mine)) A.fail(404, 'Correction request not found.');
            return { key, slot, request: slot.current, current: true };
        }
        const past = slot.history.find(r => same(r._id, requestId));
        if (past) {
            if (mine && !same(past.studentId, mine)) A.fail(404, 'Correction request not found.');
            return { key, slot, request: past, current: false };
        }
    }
    A.fail(404, 'Correction request not found.');
}
async function readAllowed(req, s, mine) {
    if (req.userRole === 'admin') return;
    if (req.userRole === 'teacher' && same(s.teacherId, req.teacherId)) return;
    if (mine && (s.roster.some(r => same(r.studentId, mine)) || slotsOf(s)[mine])) return;
    A.fail(403, 'This lecture is outside your correction scope.');
}
function event(action, actor, text, now) { return { action, actorId: actor?.accountId, actorRole: actor?.userRole || 'system', reason: text, at: now }; }
function close(slot, state, actor, text, now) {
    const r = slot.current;
    r.state = state; r.updatedAt = now; r.decisionAt = now; r.decisionReason = text;
    r.reviewerId = actor?.accountId; r.reviewerRole = actor?.userRole || 'system';
    r.events.push(event(state, actor, text, now)); slot.history.push(r); delete slot.current;
    return r;
}
function route(r, text, actor, now) {
    r.state = 'escalated_admin'; r.routeReason = text; r.updatedAt = now;
    r.events.push(event('escalated_admin', actor, text, now));
}
function slotFields(slots) { return { correctionSlots: slots, hasOpenCorrections: Object.values(slots).some(v => v.current) }; }
async function load(sessionId) {
    const s = await LectureSession.findById(A.id(sessionId)).select(projection);
    if (!s) A.fail(404, 'Lecture session not found. Unmapped legacy attendance cannot be corrected.');
    return s;
}
async function requestView(req, s, r, authority) {
    const mine = req.userRole === 'student' ? String(req.account.studentProfileId) : null;
    if (mine && !same(r.studentId, mine)) A.fail(404, 'Correction request not found.');
    const mark = currentMark(s, r.studentId), student = await Student.findById(r.studentId).select('name studentId').lean();
    const audits = (s.correctionAudit || []).filter(a => same(a.requestId, r._id)).map(a => ({
        id: a._id, requestId: a.requestId, previousStatus: a.previousStatus, newStatus: a.newStatus, actorRole: a.actorRole,
        reason: a.reason, at: a.at, entryRevision: a.entryRevision, previousEntryRevision: a.previousEntryRevision,
        sessionRevision: a.sessionRevision, originalMarkedAt: a.originalMarkedAt, originalMethod: a.originalMethod
    }));
    return { ...Q.publicRequest(r, authority), sessionId: String(s._id), offeringId: s.offeringId, course: authority.course, term: authority.term,
        classGroup: authority.classGroup, teacher: authority.teacher, student, scheduledStart: s.scheduledStart, scheduledEnd: s.scheduledEnd,
        sessionState: s.state, finalised: s.finalised, currentStatus: mark?.status || null, originalMarkedAt: mark?.markedAt, originalMethod: mark?.method,
        correctedAt: mark?.correctedAt || null, audit: audits, canReview: Q.canReview(req, s, r, authority),
        canEscalate: req.userRole === 'teacher' && Q.canReview(req, s, r, authority), canWithdraw: Boolean(mine && unresolved(r)) };
}
async function detail(req) {
    const mine = await Q.identity(req), s = await load(req.params.sessionId);
    await readAllowed(req, s, mine);
    const { request } = locate(s, A.id(req.params.requestId), mine);
    return { item: await requestView(req, s, request, await Q.authority(s._id)) };
}
async function context(req) {
    if (req.userRole !== 'student') A.fail(403, 'Only Students submit correction requests.');
    const mine = await Q.identity(req), s = await load(req.params.sessionId);
    await readAllowed(req, s, mine);
    const eligible = eligibility(s, mine), slots = slotsOf(s), slot = slots[mine], authority = await Q.authority(s._id), mark = currentMark(s, mine);
    if (slot && [...slot.history, ...(slot.current ? [slot.current] : [])].some(r => !same(r.studentId, mine))) A.fail(409, 'Correction history is inconsistent. Contact an Administrator.');
    return { session: { id: s._id, state: s.state, finalised: s.finalised, offeringId: s.offeringId, course: authority.course, term: authority.term,
        classGroup: authority.classGroup, teacher: authority.teacher, scheduledStart: s.scheduledStart, scheduledEnd: s.scheduledEnd },
        currentStatus: mark?.status || null, eligibility: { available: eligible.available && !slot?.current, reason: slot?.current ? 'A correction request is already awaiting review.' : eligible.reason },
        reviewRoute: authority.teacherMayReview ? 'teacher' : 'admin', routeReason: authority.reviewRouteReason,
        pending: slot?.current ? Q.publicRequest(slot.current, authority) : null,
        history: (slot?.history || []).map(r => Q.publicRequest(r, authority)).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt) || b.id.localeCompare(a.id)) };
}
async function submit(req) {
    if (req.userRole !== 'student') A.fail(403, 'Only Students submit correction requests.');
    const mine = await Q.identity(req); body(req.body, ['requestedStatus', 'reason']);
    if (!supported.includes(req.body.requestedStatus)) A.fail(400, 'Choose present, absent or late.');
    const text = reason(req.body.reason), requestId = new Types.ObjectId();
    const s = await A.changeSession(req.params.sessionId, async s => {
        await readAllowed(req, s, mine);
        const eligible = eligibility(s, mine); if (!eligible.available) A.fail(409, eligible.reason);
        const mark = currentMark(s, mine), slots = slotsOf(s), slot = slots[mine] || { history: [] };
        if (slot.current) A.fail(409, 'A correction request already awaits review for this lecture.');
        if (mark.status === req.body.requestedStatus) A.fail(400, 'The requested status must differ from your current status.');
        const authority = await Q.authority(s._id), now = new Date();
        slot.current = { _id: requestId, studentId: mine, submittedBy: req.accountId, originalStatus: mark.status,
            requestedStatus: req.body.requestedStatus, originalFingerprint: fingerprint(mark), originalEntryRevision: mark.correctionRevision || 0,
            submittedSessionRevision: s.revision, studentReason: text, state: authority.teacherMayReview ? 'pending_teacher' : 'escalated_admin',
            submittedAt: now, updatedAt: now, routeReason: authority.reviewRouteReason, events: [event('submitted', req, text, now)] };
        if (!authority.teacherMayReview) slot.current.events.push(event('escalated_admin', null, authority.reviewRouteReason, now));
        slots[mine] = slot; return { ...slotFields(slots), updatedBy: req.accountId };
    }, projection);
    return { item: await requestView(req, s, locate(s, requestId, mine).request, await Q.authority(s._id)) };
}
async function decide(req) {
    const mine = await Q.identity(req), requestId = A.id(req.params.requestId), action = req.params.action;
    if (!['approve', 'reject', 'escalate', 'withdraw'].includes(action)) A.fail(404, 'Correction action not found.');
    body(req.body, ['reason']);
    const text = action === 'withdraw' && req.body.reason === undefined ? 'Withdrawn by Student.' : reason(req.body.reason);
    const s = await A.changeSession(req.params.sessionId, async s => {
        await readAllowed(req, s, mine);
        const found = locate(s, requestId, mine), r = found.request;
        if (action === 'withdraw' ? !mine : mine) A.fail(403, 'You cannot perform this correction action.');
        // Retrying the same actor's committed decision is a read-only success, including after
        // a lost HTTP response. No second audit, revision, or reconciliation trigger is created.
        const terminal = { approve: 'approved', reject: 'rejected', withdraw: 'withdrawn' }[action];
        if (!found.current) {
            if (r.state === terminal && same(r.reviewerId, req.accountId)) return null;
            A.fail(409, 'This request is already ' + r.state + '. Refresh its decision history.');
        }
        const authority = await Q.authority(s._id);
        if (action !== 'withdraw' && !Q.canReview(req, s, r, authority)) A.fail(403, 'This request is outside your actionable review scope. Historical access alone does not permit correction.');
        if (action === 'escalate' && req.userRole !== 'teacher') A.fail(403, 'Only the responsible Teacher can escalate a request.');
        const slots = slotsOf(s), slot = slots[found.key], now = new Date();
        if (action === 'withdraw') close(slot, 'withdrawn', req, text, now);
        else {
            if (r.state === 'pending_teacher' && !authority.teacherMayReview) route(slot.current, authority.reviewRouteReason, null, now);
            const stale = staleReason(s, r);
            if (stale) close(slot, 'stale', req, stale, now);
            else if (action === 'escalate') route(slot.current, text, req, now);
            else if (action === 'reject') close(slot, 'rejected', req, text, now);
            else {
                const records = s.records.map(plain), mark = records.find(m => same(m.studentId, r.studentId)), oldRevision = mark.correctionRevision || 0, changeId = new Types.ObjectId();
                const audit = { _id: changeId, requestId: r._id, studentId: r.studentId, previousStatus: mark.status, newStatus: r.requestedStatus,
                    actorId: req.accountId, actorRole: req.userRole, reason: text, at: now, previousEntryRevision: oldRevision, entryRevision: oldRevision + 1,
                    sessionRevision: s.revision + 1, originalMarkedAt: mark.markedAt, originalMethod: mark.method };
                mark.status = r.requestedStatus; mark.correctedAt = now; mark.correctedBy = req.accountId; mark.correctionRevision = oldRevision + 1;
                slot.current.changeId = changeId; slot.current.approvedSessionRevision = s.revision + 1;
                close(slot, 'approved', req, text, now);
                // Attendance, terminal decision, immutable audit, and durable source marker
                // are persisted by one revision-conditional MongoDB document update.
                return { ...slotFields(slots), records, correctionAudit: [...(s.correctionAudit || []).map(plain), audit], updatedBy: req.accountId };
            }
        }
        return { ...slotFields(slots), updatedBy: req.accountId };
    }, projection);
    const item = await requestView(req, s, locate(s, requestId, mine).request, await Q.authority(s._id));
    return { item, ...(item.state === 'stale' ? { stale: true, message: item.decisionReason } : {}) };
}
async function reconcileOffering(offeringId) {
    const cursor = LectureSession.find({ offeringId, hasOpenCorrections: true }).select('_id').sort({ _id: 1 }).cursor({ batchSize: 25 });
    try {
        for await (const doc of cursor) await A.changeSession(doc._id, async s => {
            const slots = slotsOf(s), authority = await Q.authority(s._id), now = new Date(); let changed = false;
            for (const slot of Object.values(slots)) {
                if (!slot.current) continue;
                const stale = staleReason(s, slot.current);
                if (stale) { close(slot, 'stale', null, stale, now); changed = true; }
                else if (slot.current.state === 'pending_teacher' && !authority.teacherMayReview) { route(slot.current, authority.reviewRouteReason, null, now); changed = true; }
            }
            return changed ? slotFields(slots) : null;
        }, projection);
    } finally { await cursor.close(); }
}
module.exports = { context, submit, detail, decide, reconcileOffering, eligibility, fingerprint };
