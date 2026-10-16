const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = model => ({ type: Schema.Types.ObjectId, ref: model, required: true });
const lifecycle = { type: String, enum: ['active', 'archived'], default: 'active' };
const options = { timestamps: true };
const term = new Schema({ minimumAttendanceUpdatedAt: Date, minimumAttendanceUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Account' }, name: { type: String, required: true, trim: true }, minimumAttendancePercent: { type:Number, default:75, min:0, max:100 }, startDate: { type: String, required: true }, endDate: { type: String, required: true }, state: lifecycle }, options);
const group = new Schema({ label: { type: String, required: true, trim: true }, section: { type: String, default: '', trim: true }, state: lifecycle }, options);
const course = new Schema({ code: { type: String, required: true, trim: true, uppercase: true }, name: { type: String, required: true, trim: true }, state: lifecycle }, options);
course.index({ code: 1 }, { unique: true });
group.index({ label: 1, section: 1 }, { unique: true });
const interval = fields => new Schema({ ...fields, startDate: { type: String, required: true }, endDate: { type: String, required: true }, state: { type: String, enum: ['active', 'withdrawn'], default: 'active' } }, options);
const assignment = interval({ teacherId: ref('Teacher') });
const enrolment = interval({ studentId: ref('Student') });
const offering = new Schema({ courseId: ref('Course'), termId: ref('AcademicTerm'), classGroupId: ref('ClassGroup'), state: lifecycle,
    assignments: [assignment], enrolments: [enrolment], revision: { type: Number, default: 0 } }, options);
offering.index({ courseId: 1, termId: 1, classGroupId: 1 }, { unique: true });
const rosterEntry = new Schema({ studentId: ref('Student'), name: { type: String, required: true }, rollNo: { type: String, required: true } }, { _id: false });
const mark = new Schema({ studentId: ref('Student'), status: { type: String, enum: ['present', 'absent', 'late'], required: true },
    markedAt: { type: Date, required: true }, method: { type: String, enum: ['manual', 'face', 'photo', 'finalisation', 'legacy'], required: true } }, { _id: false });
const lecture = new Schema({ offeringId: ref('CourseOffering'), teacherId: ref('Teacher'), scheduledStart: { type: Date, required: true }, scheduledEnd: { type: Date, required: true },
    campusDate: { type: String, required: true }, state: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    finalised: { type: Boolean, default: false }, finalisedAt: Date, attendanceStarted: { type: Boolean, default: false },
    roster: [rosterEntry], records: [mark], cancellationReason: String, createdBy: ref('Account'), updatedBy: ref('Account'),
    legacyAttendanceId: { type: Schema.Types.ObjectId, ref: 'Attendance' }, revision: { type: Number, default: 0 } }, options);
lecture.index({ offeringId: 1, teacherId: 1, scheduledStart: 1, scheduledEnd: 1 }, { unique: true });
// Analytics filters scope by offering/Teacher/Student before streaming completed sessions.
lecture.index({ offeringId:1, state:1, finalised:1, scheduledStart:1, _id:1 });
lecture.index({ teacherId:1, state:1, finalised:1, scheduledStart:1, _id:1 });
lecture.index({ 'roster.studentId':1, state:1, finalised:1, scheduledStart:1, _id:1 });
lecture.index({ legacyAttendanceId: 1 }, { unique: true, partialFilterExpression: { legacyAttendanceId: { $type: 'objectId' } } });
require('./Correction').install(lecture, mark);
for (const schema of [term, group, course, offering, lecture]) schema.plugin(require('./notificationSource'));
module.exports = {
    AcademicTerm: mongoose.model('AcademicTerm', term), ClassGroup: mongoose.model('ClassGroup', group), Course: mongoose.model('Course', course),
    CourseOffering: mongoose.model('CourseOffering', offering), LectureSession: mongoose.model('LectureSession', lecture)
};
