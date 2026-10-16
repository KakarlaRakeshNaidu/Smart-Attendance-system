const mongoose = require('mongoose');
const { AcademicTerm, ClassGroup, Course, CourseOffering, LectureSession } = require('../models/Academic');
const Student = require('../models/Student');
const fail = (status, message, code) => { throw { status, publicMessage: message, code }; };
const id = value => { if (!mongoose.isObjectIdOrHexString(value)) fail(400, 'Invalid record ID.'); return String(value); };
const text = (value, label) => { if (typeof value !== 'string' || !value.trim() || value.length > 180) fail(400, label + ' is required (maximum 180 characters).'); return value.trim(); };
const day = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail(400, 'Use a valid YYYY-MM-DD campus date.');
    return value;
};
const range = (start, end) => { day(start); day(end); if (start > end) fail(400, 'End date must be on or after start date.'); };
const campusDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const times = body => {
    const parse = value => {
        if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || isNaN(Date.parse(value))) fail(400, 'Session times require an ISO timestamp with a timezone.');
        day(value.slice(0,10)); return new Date(value);
    };
    const start = parse(body.scheduledStart), end = parse(body.scheduledEnd);
    if (end <= start || end - start > 86400000) fail(400, 'Session end must follow start within 24 hours.');
    return { scheduledStart: start, scheduledEnd: end, campusDate: campusDate(start) };
};
const during = (row, date) => row.startDate <= date && row.endDate >= date; // Withdrawal truncates endDate, preserving prior eligibility.
const populated = query => query.populate('courseId').populate('termId').populate('classGroupId')
    .populate('assignments.teacherId', 'name email').populate('enrolments.studentId', 'name studentId email');
async function offering(value) { const doc = await CourseOffering.findById(id(value)); if (!doc) fail(404, 'Course offering not found.'); return doc; }
async function activeOffering(value) {
    const doc = await populated(CourseOffering.findById(id(value)));
    if (!doc) fail(404, 'Course offering not found.');
    if (doc.state !== 'active' || [doc.courseId, doc.termId, doc.classGroupId].some(x => !x || x.state !== 'active')) fail(409, 'Offering or an academic structure is archived. Historical records remain readable.');
    return doc;
}
const assigned = (doc, teacherId, date) => doc.assignments.some(a => String(a.teacherId._id || a.teacherId) === String(teacherId) && during(a, date));
async function roster(doc, date) {
    const ids = [...new Set(doc.enrolments.filter(e => during(e, date)).map(e => String(e.studentId._id || e.studentId)))];
    const students = await Student.find({ _id: { $in: ids } }).select('name studentId').sort({ studentId: 1 });
    return students.map(s => ({ studentId: s._id, name: s.name, rollNo: s.studentId }));
}
async function canRead(req, session) {
    if (req.userRole === 'admin') return;
    if (req.userRole === 'teacher' && String(session.teacherId) === String(req.teacherId)) return;
    if (req.userRole === 'student' && req.account.studentProfileId) {
        const list = session.attendanceStarted ? session.roster : await roster(await offering(session.offeringId), session.campusDate);
        if (list.some(s => String(s.studentId) === String(req.account.studentProfileId))) return;
    }
    fail(403, 'You cannot access this lecture session.');
}
async function canMark(req, session) {
    if (req.userRole !== 'teacher' || !req.teacherId || String(session.teacherId) !== String(req.teacherId)) fail(403, 'Only the teaching Teacher may mark this session.');
    if (session.finalised || session.state !== 'scheduled') fail(409, 'Cancelled, completed or finalised sessions cannot be changed.');
    const doc = await activeOffering(session.offeringId);
    if (!assigned(doc, req.teacherId, session.campusDate) || !assigned(doc, req.teacherId, campusDate(new Date()))) fail(403, 'Your effective teaching assignment has ended or does not cover this lecture.');
    return doc;
}
// MongoDB updates to one document are atomic. Compare revision and retry so concurrent marking/finalising never loses a write.
async function changeSession(value, mutate, projection = '') {
    for (let attempt = 0; attempt < 12; attempt++) {
        const session = await LectureSession.findById(id(value)).select(projection);
        if (!session) fail(404, 'Lecture session not found.');
        const fields = await mutate(session);
        if (fields === null) return session; // Idempotent correction retry; no revision or notification churn.
        const result = await LectureSession.findOneAndUpdate({ _id: session._id, revision: session.revision },
            { $set: { ...fields, updatedAt: new Date() }, $inc: { revision: 1 } }, { new: true, runValidators: true }).select(projection);
        if (result) return result;
    }
    fail(409, 'Session changed concurrently. Refresh and retry.');
}
async function changeOffering(value, mutate) {
    for (let attempt = 0; attempt < 12; attempt++) {
        const doc = await offering(value);
        const fields = await mutate(doc);
        const result = await CourseOffering.findOneAndUpdate({ _id: doc._id, revision: doc.revision }, { $set: { ...fields, updatedAt: new Date() }, $inc: { revision: 1 } }, { new: true, runValidators: true });
        if (result) return result;
    }
    fail(409, 'Offering changed concurrently. Refresh and retry.');
}
async function view(req, session) {
    if (req.userRole === 'student') return require('./studentPortalService').sessionView(req,session);
    await canRead(req, session);
    const doc = await populated(CourseOffering.findById(session.offeringId));
    const teacher = await require('../models/Teacher').findById(session.teacherId).select('name email');
    let list = session.attendanceStarted ? session.roster : await roster(await offering(session.offeringId), session.campusDate);
    let records = session.records;
    if (req.userRole === 'student') {
        list = list.filter(s => String(s.studentId) === String(req.account.studentProfileId));
        records = records.filter(s => String(s.studentId) === String(req.account.studentProfileId));
    }
    return { ...session.toObject(), offering: doc ? { _id: doc._id, course: doc.courseId, term: doc.termId, classGroup: doc.classGroupId } : null,
        teacher, roster: list, records, canMark:req.userRole==='teacher' && String(session.teacherId)===String(req.teacherId) && session.state==='scheduled' && !session.finalised && doc?.state==='active' && [doc.courseId,doc.termId,doc.classGroupId].every(d=>d?.state==='active') && assigned(doc,req.teacherId,session.campusDate) && assigned(doc,req.teacherId,campusDate(new Date())) };
}
module.exports = { fail, id, text, day, range, times, campusDate, during, populated, offering, activeOffering, assigned, roster, canRead, canMark, changeSession, changeOffering, view };
