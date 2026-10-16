const mongoose = require('mongoose');
const A = require('./academicService');
const { LectureSession } = require('../models/Academic');
const { states } = require('../models/Correction');
const oid = id => new mongoose.Types.ObjectId(A.id(id));
// One responsibility predicate for queue filtering AND mutation authorisation.
// Assignment semantics intentionally match academicService.assigned, including effective dates.
function responsibilityStages() {
    const today = A.campusDate(new Date());
    const lookup = (from, field, as, projection) => ({ $lookup: { from, let: { key: '$' + field }, pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$key'] } } }, { $project: projection }
    ], as } });
    return [
        lookup('courseofferings', 'offeringId', 'offering', { courseId: 1, termId: 1, classGroupId: 1, state: 1, assignments: 1 }),
        { $set: { offering: { $first: '$offering' } } },
        lookup('courses', 'offering.courseId', 'course', { code: 1, name: 1, state: 1 }),
        lookup('academicterms', 'offering.termId', 'term', { name: 1, state: 1 }),
        lookup('classgroups', 'offering.classGroupId', 'classGroup', { label: 1, section: 1, state: 1 }),
        lookup('teachers', 'teacherId', 'teacher', { name: 1 }),
        { $lookup: { from: 'accounts', let: { teacher: '$teacherId' }, pipeline: [
            { $match: { role: 'teacher', isActive: true, $expr: { $eq: ['$teacherProfileId', '$$teacher'] } } }, { $project: { _id: 1 } }, { $limit: 1 }
        ], as: 'teacherAccount' } },
        { $set: {
            course: { $first: '$course' }, term: { $first: '$term' }, classGroup: { $first: '$classGroup' }, teacher: { $first: '$teacher' },
            effectiveAssignments: { $filter: { input: { $ifNull: ['$offering.assignments', []] }, as: 'a', cond: { $and: [
                { $eq: ['$$a.teacherId', '$teacherId'] }, { $lte: ['$$a.startDate', '$campusDate'] }, { $gte: ['$$a.endDate', '$campusDate'] },
                { $lte: ['$$a.startDate', today] }, { $gte: ['$$a.endDate', today] }
            ] } } }
        } },
        { $set: { reviewRouteReason: { $switch: { branches: [
            { case: { $eq: [{ $size: '$teacherAccount' }, 0] }, then: 'The original teaching Teacher has no active linked account.' },
            { case: { $not: [{ $ifNull: ['$teacher._id', false] }] }, then: 'The original Teacher profile is unavailable.' },
            { case: { $not: [{ $and: [{ $eq: ['$offering.state', 'active'] }, { $eq: ['$course.state', 'active'] }, { $eq: ['$term.state', 'active'] }, { $eq: ['$classGroup.state', 'active'] }] }] }, then: 'The offering or an academic structure is archived or unavailable.' },
            { case: { $eq: [{ $size: '$effectiveAssignments' }, 0] }, then: 'The original Teacher has no effective assignment covering both this lecture and today.' }
        ], default: '' } } } },
        { $set: { teacherMayReview: { $eq: ['$reviewRouteReason', ''] } } }
    ];
}
async function authority(sessionId) {
    const [context] = await LectureSession.aggregate([{ $match: { _id: oid(sessionId) } }, ...responsibilityStages(),
        { $project: { teacherMayReview: 1, reviewRouteReason: 1, course: 1, term: 1, classGroup: 1, teacher: 1, offeringId: 1 } }]);
    if (!context) A.fail(404, 'Lecture session not found. Unmapped legacy attendance cannot be corrected.');
    return context;
}
async function identity(req) {
    if (req.userRole === 'student') return String(await require('./studentPortalService').identity(req));
    if (req.userRole === 'teacher' && !req.teacherId) A.fail(403, 'A linked Teacher profile is required.');
    if (!['teacher', 'admin'].includes(req.userRole)) A.fail(403, 'Correction access denied.');
    return null;
}
function validate(query) {
    for (const k of Object.keys(query)) if (!['page', 'limit', 'state', 'offeringId', 'from', 'to', 'queue', 'sort'].includes(k) || typeof query[k] !== 'string') A.fail(400, 'Invalid correction filter.');
    const integer = (v, d, max) => { if (v === undefined) return d; if (!/^\d+$/.test(v) || +v < 1 || +v > max) A.fail(400, 'Invalid pagination.'); return +v; };
    if (query.state && !states.includes(query.state)) A.fail(400, 'Invalid correction state.');
    if (query.queue && !['all', 'actionable'].includes(query.queue)) A.fail(400, 'Invalid review queue.');
    if (query.sort && !['oldest', 'newest'].includes(query.sort)) A.fail(400, 'Invalid sorting.');
    if (query.offeringId) A.id(query.offeringId);
    if (query.from) A.day(query.from); if (query.to) A.day(query.to);
    if (query.from && query.to) A.range(query.from, query.to);
    return { ...query, page: integer(query.page, 1, 10000), limit: integer(query.limit, 20, 100) };
}
function effectiveState(r, authority) { return r.state === 'pending_teacher' && !authority.teacherMayReview ? 'escalated_admin' : r.state; }
function canReview(req, session, r, authority) {
    if (!['pending_teacher', 'escalated_admin'].includes(r.state)) return false;
    if (req.userRole === 'teacher') return String(session.teacherId) === String(req.teacherId) && r.state === 'pending_teacher' && authority.teacherMayReview;
    return req.userRole === 'admin' && effectiveState(r, authority) === 'escalated_admin';
}
function publicRequest(r, authority) {
    return { id: String(r._id), studentId: String(r.studentId), originalStatus: r.originalStatus, requestedStatus: r.requestedStatus,
        studentReason: r.studentReason, state: effectiveState(r, authority), storedState: r.state, submittedAt: r.submittedAt, updatedAt: r.updatedAt,
        routeReason: r.state === 'pending_teacher' && !authority.teacherMayReview ? authority.reviewRouteReason : r.routeReason || '',
        reviewerRole: r.reviewerRole, decisionAt: r.decisionAt, decisionReason: r.decisionReason, changeId: r.changeId,
        submittedSessionRevision: r.submittedSessionRevision, approvedSessionRevision: r.approvedSessionRevision,
        events: (r.events || []).map(e => ({ action: e.action, actorRole: e.actorRole, reason: e.reason, at: e.at })) };
}
async function list(req) {
    const mine = await identity(req), q = validate(req.query);
    if (q.offeringId) {
        const allowed = await require('./attendanceAnalyticsService').authorisedOfferings(req);
        if (!allowed.some(o => String(o._id) === q.offeringId)) A.fail(req.userRole === 'admin' ? 404 : 403, 'Offering is outside your correction scope.');
    }
    const match = { correctionSlots: { $exists: true } };
    if (req.userRole === 'teacher') match.teacherId = oid(req.teacherId);
    if (mine) match['correctionSlots.' + mine] = { $exists: true };
    if (q.offeringId) match.offeringId = oid(q.offeringId);
    if (q.from || q.to) { match.campusDate = {}; if (q.from) match.campusDate.$gte = q.from; if (q.to) match.campusDate.$lte = q.to; }
    const pipeline = [{ $match: match }, { $project: { offeringId: 1, teacherId: 1, campusDate: 1, scheduledStart: 1, scheduledEnd: 1,
        slots: mine ? [{ v: '$correctionSlots.' + mine }] : { $objectToArray: '$correctionSlots' } } }, { $unwind: '$slots' },
        { $set: { requests: { $concatArrays: [{ $ifNull: ['$slots.v.history', []] }, { $cond: [{ $ifNull: ['$slots.v.current', false] }, ['$slots.v.current'], []] }] } } },
        { $unwind: '$requests' }, ...(mine ? [{ $match: { 'requests.studentId': oid(mine) } }] : []), { $unset: 'slots' }, ...responsibilityStages(),
        { $set: { effectiveState: { $cond: [{ $and: [{ $eq: ['$requests.state', 'pending_teacher'] }, { $not: ['$teacherMayReview'] }] }, 'escalated_admin', '$requests.state'] } } }];
    if (q.state) pipeline.push({ $match: { effectiveState: q.state } });
    if (q.queue === 'actionable') {
        if (req.userRole === 'student') A.fail(400, 'Students have no staff review queue.');
        pipeline.push({ $match: req.userRole === 'teacher' ? { effectiveState: 'pending_teacher', teacherMayReview: true } : { effectiveState: 'escalated_admin' } });
    }
    const direction = q.sort === 'oldest' ? 1 : -1;
    pipeline.push({ $facet: { items: [{ $sort: { 'requests.submittedAt': direction, 'requests._id': direction, _id: direction } }, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit },
        { $lookup: { from: 'students', localField: 'requests.studentId', foreignField: '_id', pipeline: [{ $project: { name: 1, studentId: 1 } }], as: 'student' } },
        { $project: { requests: 1, teacherMayReview: 1, reviewRouteReason: 1, offeringId: 1, teacherId: 1, scheduledStart: 1, scheduledEnd: 1, course: 1, term: 1, classGroup: 1, teacher: 1, student: { $first: '$student' } } }], count: [{ $count: 'total' }] } });
    const [result] = await LectureSession.aggregate(pipeline).option({ maxTimeMS: 15000 }).allowDiskUse(true);
    const total = result.count[0]?.total || 0;
    return { items: result.items.map(s => ({ ...publicRequest(s.requests, s), sessionId: String(s._id), offeringId: s.offeringId,
        course: s.course, term: s.term, classGroup: s.classGroup, teacher: s.teacher, student: s.student,
        scheduledStart: s.scheduledStart, scheduledEnd: s.scheduledEnd, canReview: canReview(req, s, s.requests, s) })),
        pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) }, timezone: 'Asia/Kolkata' };
}
module.exports = { authority, identity, validate, effectiveState, canReview, publicRequest, list };
