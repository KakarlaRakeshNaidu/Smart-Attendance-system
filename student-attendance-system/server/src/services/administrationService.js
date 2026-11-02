const { TeacherAcademicAccess, AuditLog } = require('../models/Administration');
const A = require('./academicService');
const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = doc => { const value = doc.toJSON ? doc.toJSON() : { ...doc }; return { ...value, id: String(value._id), status: value.status || 'active' }; };
function academicFields(body, previous = {}) {
 const value = { academicYear: Number(body.academicYear ?? previous.academicYear ?? 1), branch: String(body.branch ?? previous.branch ?? 'CSE').trim().toUpperCase(),
  section: String(body.section ?? previous.section ?? 'A').trim().toUpperCase(), subsection: String(body.subsection ?? previous.subsection ?? 'A1').trim().toUpperCase() };
 if (![1,2,3,4].includes(value.academicYear) || !['CSE','ECE','AIDE'].includes(value.branch) || !['A','B','C','D'].includes(value.section) || ![1,2,3].some(n => value.subsection === value.section + n)) A.fail(400, 'Choose a valid academic year, branch, section and subsection.');
 return value;
}
function accessFields(body) {
 const subsection = String(body.subsection || 'ALL').trim().toUpperCase();
 const section = String(body.section || 'A').trim().toUpperCase();
 const value = academicFields({ ...body, subsection: subsection === 'ALL' ? section + '1' : subsection });
 return { ...value, subsection };
}
const batchFilter = batch => ({ academicYear: Number(batch.academicYear), branch: batch.branch, section: batch.section, ...(batch.subsection !== 'ALL' ? { subsection: batch.subsection } : {}) });
async function access(req, batch) {
 if (req.userRole === 'admin') return;
 if (!req.teacherId) A.fail(403, 'Teacher profile is required.');
 const permission = await TeacherAcademicAccess.exists({ teacherId: req.teacherId, academicYear: batch.academicYear, branch: batch.branch, section: batch.section, subsection: { $in: batch.subsection === 'ALL' ? ['ALL'] : ['ALL', batch.subsection] } });
 if (!permission) A.fail(403, 'This academic batch is not assigned to you.');
}
async function studentFilter(req) {
 if (req.userRole === 'admin') return {};
 const permissions = await TeacherAcademicAccess.find({ teacherId: req.teacherId }).lean();
 const { CourseOffering } = require('../models/Academic');
 const offerings = await CourseOffering.find({ state: 'active', assignments: { $elemMatch: { teacherId: req.teacherId, state: 'active', startDate: { $lte: A.campusDate(new Date()) }, endDate: { $gte: A.campusDate(new Date()) } } } }).select('enrolments').lean();
 const historical = await require('../models/Academic').LectureSession.distinct('roster.studentId', { teacherId: req.teacherId });
 const legacy = await require('../models/Attendance').distinct('records.studentId', { teacherId: req.teacherId });
 const ids = [...historical, ...legacy, ...offerings.flatMap(o => o.enrolments.filter(e => e.state === 'active' && A.during(e, A.campusDate(new Date()))).map(e => e.studentId))];
 return { $or: [{ registeredBy: req.teacherId }, { _id: { $in: ids } }, ...permissions.map(batchFilter)] };
}
async function audit(req, action, targetModel, targetId, changes = {}) {
 // Never persist credentials, activation tokens or biometric vectors in audit history.
 const safe = Object.fromEntries(Object.entries(changes).filter(([key]) => !/password|token|embedding|faceImage|^image$/i.test(key)));
 await AuditLog.create({ actorId: req.accountId, actorName: req.account.name, actorRole: req.userRole, action, targetModel, targetId: String(targetId || ''), changes: safe, ip: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 300) });
}
const wrap = handler => async (req, res) => { try { await handler(req, res); } catch (error) { if (error.code === 11000) return res.status(409).json({ success: false, message: 'A record with these details already exists.' }); return require('../utils/respondError')(res, error); } };
module.exports = { escape, plain, academicFields, accessFields, batchFilter, access, studentFilter, audit, wrap };
