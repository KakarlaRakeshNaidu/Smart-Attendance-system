const Student = require('../models/Student');
const { LectureSession } = require('../models/Academic');
const A = require('../services/academicService'),
    D = require('../services/administrationService');
const P = require('../services/studentPortalService');
const ok = (res, data) => res.json({ success: true, ...data });
async function groups(req) {
    const mine = await P.identity(req),
        courses = await P.courses(req),
        summaries = courses.map((course) => ({ ...course.summary, offeringId: course.offeringId }));
    const byId = new Map(summaries.map((s) => [String(s.offeringId), s]));
    const result = courses.map((c) => {
        const summary = byId.get(String(c.offeringId)) || {
            eligible: 0,
            attended: 0,
            absent: 0,
            percentage: null,
            minimum: c.term?.minimumAttendancePercent ?? 75,
            belowMinimum: false
        };
        return {
            enrollment: {
                id: String(c.offeringId),
                studentId: String(mine),
                subjectId: String(c.offeringId),
                academicSession: c.term?.name,
                class: { name: c.classGroup?.label, code: c.classGroup?.code || c.classGroup?.label },
                subject: {
                    id: String(c.offeringId),
                    name: c.course?.name,
                    code: c.course?.code,
                    attendanceThreshold: summary.minimum
                }
            },
            teacherName:
                c.teachers
                    ?.map((t) => t.name)
                    .filter(Boolean)
                    .join(', ') || '',
            totalSessions: summary.eligible || 0,
            attended: summary.attended || 0,
            missed: summary.absent || 0,
            percentage: summary.percentage,
            threshold: summary.minimum,
            belowThreshold: summary.belowMinimum === true,
            dataQuality: summary.dataQuality,
            status: summary.status,
            records: []
        };
    });
    const docs = await LectureSession.find({ 'roster.studentId': mine, state: 'completed', finalised: true })
        .sort({ scheduledStart: -1, _id: -1 })
        .limit(10001);
    if (docs.length > 10000) A.fail(413, 'Use Semester Reports to filter a large attendance history.');
    const teachers = await require('../models/Teacher')
        .find({ _id: { $in: [...new Set(docs.map((doc) => String(doc.teacherId)))] } })
        .select('name')
        .lean();
    const teacherNames = new Map(teachers.map((teacher) => [String(teacher._id), teacher.name]));
    for (const doc of docs) {
        const group = result.find((g) => g.enrollment.subjectId === String(doc.offeringId));
        if (!group) continue;
        const mark = doc.records.find((m) => String(m.studentId) === String(mine));
        if (!mark) continue;
        const teacherName = teacherNames.get(String(doc.teacherId));
        group.records.push({
            id: doc.id,
            sessionId: doc.id,
            date: doc.scheduledStart,
            status: mark.status,
            source: ['face', 'photo'].includes(mark.method) ? 'face' : 'manual',
            teacherName: teacherName || '',
            sessionLabel: doc.campusDate,
            markedAt: mark.markedAt
        });
    }
    if (req.query.fromDate) A.day(req.query.fromDate);
    if (req.query.toDate) A.day(req.query.toDate);
    if (req.query.fromDate || req.query.toDate)
        for (const group of result) {
            group.records = group.records.filter(
                (r) =>
                    (!req.query.fromDate || A.campusDate(r.date) >= req.query.fromDate) &&
                    (!req.query.toDate || A.campusDate(r.date) <= req.query.toDate)
            );
            const counts = {
                eligible: group.records.length,
                present: group.records.filter((r) => r.status === 'present').length,
                late: group.records.filter((r) => r.status === 'late').length,
                absent: group.records.filter((r) => r.status === 'absent').length,
                invalid: 0
            };
            const summary = require('../services/attendanceCalculation').result(counts, group.threshold);
            Object.assign(group, {
                totalSessions: summary.eligible,
                attended: summary.attended,
                missed: summary.absent,
                percentage: summary.percentage,
                belowThreshold: summary.belowMinimum
            });
        }
    return result;
}
exports.profile = D.wrap(async (req, res) => {
    const mine = await P.identity(req),
        doc = await Student.findById(mine);
    ok(res, { student: { ...D.plain(doc), email: req.account.email } });
});
exports.attendance = D.wrap(async (req, res) => {
    const attendance = await groups(req);
    ok(res, { attendance, count: attendance.length });
});
exports.summary = D.wrap(async (req, res) => {
    const attendance = await groups(req);
    const totalConducted = attendance.reduce((n, g) => n + g.totalSessions, 0),
        totalAttended = attendance.reduce((n, g) => n + g.attended, 0),
        dataQuality = attendance.some((g) => g.dataQuality);
    ok(res, {
        summary: {
            overallPercentage:
                totalConducted && !dataQuality ? Math.round((totalAttended * 100) / totalConducted) : null,
            totalConducted,
            totalAttended,
            totalMissed: totalConducted - totalAttended,
            dataQuality,
            subjects: attendance.map((g) => ({
                subjectId: g.enrollment.subjectId,
                subjectName: g.enrollment.subject.name,
                subjectCode: g.enrollment.subject.code,
                className: g.enrollment.class.name,
                academicSession: g.enrollment.academicSession,
                teacherName: g.teacherName,
                conducted: g.totalSessions,
                attended: g.attended,
                missed: g.missed,
                percentage: g.percentage,
                threshold: g.threshold,
                belowThreshold: g.belowThreshold
            }))
        }
    });
});
exports.enrollments = D.wrap(async (req, res) => {
    const enrollments = (await groups(req)).map((g) => g.enrollment);
    ok(res, { enrollments, count: enrollments.length });
});
exports.subject = D.wrap(async (req, res) => {
    const group = (await groups(req)).find((g) => g.enrollment.subjectId === A.id(req.params.subjectId));
    if (!group) A.fail(404, 'Subject not found.');
    ok(res, { ...group, subject: group.enrollment.subject, class: group.enrollment.class });
});
