const mongoose = require('mongoose');
const { Notification } = require('../models/Notification');
const Analytics = require('./attendanceAnalyticsService');
const A = require('./academicService');

function filters(query) {
    const allowed = ['page', 'limit', 'status', 'unread'];
    for (const key of Object.keys(query)) if (!allowed.includes(key) || typeof query[key] !== 'string') A.fail(400, 'Invalid notification filter.');
    const integer = (v, fallback, max) => { if (v === undefined) return fallback; if (!/^\d+$/.test(v) || +v < 1 || +v > max) A.fail(400, 'Invalid pagination.'); return +v; };
    if (query.status && !['active', 'resolved', 'unavailable'].includes(query.status)) A.fail(400, 'Invalid notification status.');
    if (query.unread !== undefined && !['true', 'false'].includes(query.unread)) A.fail(400, 'Invalid unread filter.');
    return { page: integer(query.page, 1, 10000), limit: integer(query.limit, 20, 100), status: query.status, unread: query.unread };
}
async function authorised(req, extra = {}) {
    if (!['student', 'teacher'].includes(req.userRole)) A.fail(403, 'Notifications are available to Students and Teachers.');
    const offerings = await Analytics.authorisedOfferings(req);
    const match = { recipientId: req.account._id, recipientRole: req.userRole, hasAlert: { $ne: false }, offeringId: { $in: offerings.map(o => o._id) }, ...extra };
    if (req.userRole === 'student') Object.assign(match, { studentId: req.account.studentProfileId, scope: 'student' });
    else Object.assign(match, { teacherId: new mongoose.Types.ObjectId(String(req.teacherId)), scope: 'teacher:' + req.teacherId });
    const pipeline = [{ $match: match }];
    if (req.userRole === 'teacher') pipeline.push(
        { $lookup: { from: 'lecturesessions', let: { offering: '$offeringId', student: '$studentId' }, pipeline: [
            { $match: { teacherId: new mongoose.Types.ObjectId(String(req.teacherId)), attendanceStarted: true, $expr: { $and: [{ $eq: ['$offeringId', '$$offering'] }, { $in: ['$$student', '$roster.studentId'] }] } } },
            { $limit: 1 }, { $project: { _id: 1 } }
        ], as: 'permittedHistory' } }, { $match: { 'permittedHistory.0': { $exists: true } } }
    );
    return pipeline;
}
const publicFields = { _id: 1, studentId: 1, offeringId: 1, termId: 1, scope: 1, attended: 1, eligible: 1, present: 1, late: 1, absent: 1, percentage: 1, minimum: 1, evaluatedAt: 1, snapshotAt: 1, status: 1, reason: 1, readAt: 1, resolvedAt: 1, createdAt: 1, updatedAt: 1 };
async function list(req) {
    const q = filters(req.query), extra = {};
    if (q.status) extra.status = q.status;
    if (q.unread) extra.readAt = q.unread === 'true' ? null : { $ne: null };
    const base = await authorised(req, extra);
    const [result] = await Notification.aggregate([...base, { $facet: {
        count: [{ $count: 'total' }], items: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }, { $project: publicFields }]
    } }]).option({ maxTimeMS: 15000 });
    const items = await Notification.populate(result.items, [
        { path: 'studentId', select: 'name studentId' },
        { path: 'offeringId', select: 'courseId classGroupId', populate: [{ path: 'courseId', select: 'name code' }, { path: 'classGroupId', select: 'label section' }] },
        { path: 'termId', select: 'name' }
    ]);
    // Students do not receive populated Student objects or any other Student details.
    if (req.userRole === 'student') for (const item of items) delete item.studentId;
    const total = result.count[0]?.total || 0;
    return { items, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } };
}
async function unread(req) {
    if (req.method === 'GET' && Object.keys(req.query || {}).length) A.fail(400, 'Unread count accepts no filters.');
    const results = await Notification.aggregate([...await authorised(req, { readAt: null }), { $count: 'total' }]).option({ maxTimeMS: 15000 });
    return { unread: results[0]?.total || 0 };
}
async function read(req, all = false) {
    if (Object.keys(req.query || {}).length) A.fail(400, 'Mark-read accepts no filters.');
    if (Object.keys(req.body || {}).length) A.fail(400, 'No notification fields may be submitted.');
    const match = all ? { readAt: null } : { _id: new mongoose.Types.ObjectId(A.id(req.params.id)) };
    const cursor = Notification.aggregate([...await authorised(req, match), { $project: { _id: 1 } }]).cursor({ batchSize: 100 });
    let changed = 0, found = false, batch = [];
    async function flush() {
        if (!batch.length) return;
        const result = await Notification.updateMany({ _id: { $in: batch }, recipientId: req.account._id, readAt: null }, { $set: { readAt: new Date() } });
        changed += result.modifiedCount; batch = [];
    }
    try { for await (const n of cursor) { found = true; batch.push(n._id); if (batch.length === 100) await flush(); } await flush(); } finally { await cursor.close(); }
    if (!all && !found) A.fail(404, 'Notification not found.');
    return { changed, ...await unread(req) };
}
module.exports = { filters, authorised, list, unread, read };
