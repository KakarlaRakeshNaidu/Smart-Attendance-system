const {
  seed,
  cleanup,
  password
} = require('./fixtures');
const {
  AcademicTerm,
  ClassGroup,
  Course,
  CourseOffering,
  LectureSession
} = require('../src/models/Academic');
const Account = require('../src/models/Account'),
  Teacher = require('../src/models/Teacher'),
  Attendance = require('../src/models/Attendance');
async function seedAnalytics() {
  const fx = await seed();
  await Promise.all([AcademicTerm.init(), ClassGroup.init(), Course.init(), CourseOffering.init(), LectureSession.init()]);
  const term = await AcademicTerm.create({
    name: 'ISOLATED Analytics term',
    startDate: '2025-01-01',
    endDate: '2030-12-31'
  });
  const group = await ClassGroup.create({
    label: 'ISOLATED Analytics class',
    section: 'A'
  });
  const foreignGroup = await ClassGroup.create({
    label: 'ISOLATED Private class',
    section: 'B'
  });
  const otherTeacher = await Teacher.create({
    name: 'ISOLATED Other Teacher',
    email: 'analytics.other@example.test',
    password,
    subject: 'Synthetic testing'
  });
  const otherAccount = new Account({
    name: otherTeacher.name,
    email: otherTeacher.email,
    role: 'teacher',
    isActive: true,
    teacherProfileId: otherTeacher.id
  });
  await otherAccount.setPassword(password);
  await otherAccount.save();
  fx.users.otherTeacher = otherAccount;
  const courses = await Course.create([{
    code: 'AN-PRIMARY',
    name: 'ISOLATED Primary course'
  }, {
    code: 'AN-SECONDARY',
    name: 'ISOLATED Secondary course'
  }, {
    code: 'AN-ZERO',
    name: 'ISOLATED No completed lectures'
  }, {
    code: 'AN-PRIVATE',
    name: 'ISOLATED Other Student only'
  }]);
  const interval = {
    startDate: '2025-01-01',
    endDate: '2030-12-31'
  };
  const primary = await CourseOffering.create({
    courseId: courses[0].id,
    termId: term.id,
    classGroupId: group.id,
    assignments: [{
      teacherId: fx.teacher.id,
      ...interval
    }, {
      teacherId: otherTeacher.id,
      ...interval
    }],
    enrolments: [fx.student, fx.otherStudent].map(s => ({
      studentId: s.id,
      ...interval
    }))
  });
  const secondary = await CourseOffering.create({
    courseId: courses[1].id,
    termId: term.id,
    classGroupId: group.id,
    assignments: [{
      teacherId: fx.teacher.id,
      ...interval
    }],
    enrolments: [{
      studentId: fx.student.id,
      ...interval
    }]
  });
  const zero = await CourseOffering.create({
    courseId: courses[2].id,
    termId: term.id,
    classGroupId: group.id,
    assignments: [{
      teacherId: fx.teacher.id,
      ...interval
    }],
    enrolments: [{
      studentId: fx.student.id,
      ...interval
    }]
  });
  const privateOffering = await CourseOffering.create({
    courseId: courses[3].id,
    termId: term.id,
    classGroupId: foreignGroup.id,
    assignments: [{
      teacherId: otherTeacher.id,
      ...interval
    }],
    enrolments: [{
      studentId: fx.otherStudent.id,
      ...interval
    }]
  });
  async function lecture(offering, date, statuses, extra = {}) {
    const teacherId = extra.teacherId || fx.teacher.id,
      start = new Date(date);
    const ids = offering.id === primary.id ? [fx.student, fx.otherStudent] : [fx.student];
    return LectureSession.create({
      offeringId: offering.id,
      teacherId,
      scheduledStart: start,
      scheduledEnd: new Date(+start + 1200000),
      campusDate: require('../src/services/academicService').campusDate(start),
      state: 'completed',
      finalised: true,
      attendanceStarted: true,
      finalisedAt: new Date(),
      roster: ids.map(s => ({
        studentId: s.id,
        name: s.name,
        rollNo: s.studentId
      })),
      records: statuses.map((status, i) => ({
        studentId: ids[i].id,
        status,
        method: 'manual',
        markedAt: start
      })),
      createdBy: fx.users.admin.id,
      updatedBy: fx.users.admin.id,
      ...extra
    });
  }
  const sessions = [];
  for (const [date, marks, extra] of [['2026-01-31T18:00:00Z', ['present', 'absent'], {}], ['2026-01-31T19:00:00Z', ['late', 'present'], {}], ['2026-02-01T19:30:00Z', ['present', 'absent'], {}], ['2026-02-01T20:30:00Z', ['absent', 'late'], {
    teacherId: otherTeacher.id
  }]]) sessions.push(await lecture(primary, date, marks, extra));
  await lecture(secondary, '2026-02-10T03:30:00Z', ['absent']);
  await lecture(primary, '2026-02-11T03:30:00Z', ['absent', 'absent'], {
    state: 'scheduled',
    finalised: false
  });
  await lecture(primary, '2026-02-12T03:30:00Z', ['absent', 'absent'], {
    finalised: false
  });
  await lecture(primary, '2026-02-13T03:30:00Z', ['absent', 'absent'], {
    state: 'cancelled'
  });
  const legacy = await Attendance.create({
    teacherId: fx.teacher.id,
    date: '2026-01-31T18:00:00Z',
    subject: 'ISOLATED unmapped legacy',
    records: [{
      studentId: fx.student.id,
      studentName: fx.student.name,
      studentRollNo: fx.student.studentId,
      status: 'present'
    }]
  });
  return {
    fx,
    term,
    group,
    foreignGroup,
    primary,
    secondary,
    zero,
    privateOffering,
    otherTeacher,
    sessions,
    legacy,
    lecture
  };
}
module.exports = {
  seedAnalytics,
  cleanup,
  password
};
