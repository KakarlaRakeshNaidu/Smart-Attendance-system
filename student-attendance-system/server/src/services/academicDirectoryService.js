const { AcademicTerm, ClassGroup, Course, CourseOffering } = require('../models/Academic');
const A = require('./academicService');
const D = require('./administrationService');
const classView = doc => ({ ...D.plain(doc), name:doc.label, status:doc.state, year:doc.year || '', academicSession:doc.academicSession || '' });
const subjectView = doc => ({ id:String(doc._id), _id:doc._id, name:doc.courseId?.name, code:doc.courseId?.code, classId:doc.classGroupId?._id, class:doc.classGroupId ? classView(doc.classGroupId) : null, academicSession:doc.termId?.name, credits:doc.credits || 0, attendanceThreshold:doc.termId?.minimumAttendancePercent ?? 75, status:doc.state });
async function term(name, threshold = 75) {
 const label = A.text(name,'Academic session');
 let doc = await AcademicTerm.findOne({name:label});
 if (doc) return doc;
 const match = label.match(/(20\d{2})/), year = match ? Number(match[1]) : Number(A.campusDate(new Date()).slice(0,4));
 return AcademicTerm.create({name:label,startDate:`${year}-06-01`,endDate:`${year+1}-05-31`,minimumAttendancePercent:threshold});
}
const offerings = filter => A.populated(CourseOffering.find(filter));
async function subject(value, classId, academicSession) {
 const doc = await A.activeOffering(value);
 if (classId && String(doc.classGroupId._id) !== A.id(classId)) A.fail(400,'The selected subject belongs to another class.');
 if (academicSession && doc.termId.name !== academicSession) A.fail(400,'The academic session must match the subject session.');
 return doc;
}
module.exports={classView,subjectView,term,offerings,subject};
