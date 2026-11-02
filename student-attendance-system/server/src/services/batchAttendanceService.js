const { createHash } = require('crypto');
const { AcademicTerm, ClassGroup, Course, CourseOffering, LectureSession } = require('../models/Academic');
const Student = require('../models/Student');
const A = require('./academicService'),
    D = require('./administrationService');
const batchKey = (batch) => [batch.academicYear, batch.branch, batch.section, batch.subsection].join(':');
async function ensure(req) {
    const batch = D.accessFields(req.body);
    await D.access(req, batch);
    if (req.userRole !== 'teacher' || !req.teacherId)
        A.fail(403, 'Only a teaching Teacher may record attendance.');
    const today = A.campusDate(new Date()),
        year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 6 ? 1 : 0);
    const subject = (req.teacher.subject || 'General attendance').trim();
    const code =
        'BATCH-' +
        createHash('sha256').update(subject.toLowerCase()).digest('hex').slice(0, 12).toUpperCase();
    const key = batchKey(batch) + ':' + code;
    const existing = await LectureSession.findOne({
        teacherId: req.teacherId,
        campusDate: today,
        batchKey: key
    });
    if (existing) {
        await A.canMark(req, existing);
        return existing;
    }
    const students = await Student.find({
        ...D.batchFilter(batch),
        status: { $nin: ['archived', 'inactive'] }
    }).select('_id name studentId');
    if (!students.length) A.fail(409, 'No active students belong to this batch.');
    // Each batch is represented by the same academic structures used by lecture analytics.
    const term = await AcademicTerm.findOneAndUpdate(
        { name: `${year}-${String(year + 1).slice(-2)}` },
        {
            $setOnInsert: {
                startDate: `${year}-06-01`,
                endDate: `${year + 1}-05-31`,
                state: 'active',
                minimumAttendancePercent: 75
            }
        },
        { upsert: true, new: true, runValidators: true }
    );
    const group = await ClassGroup.findOneAndUpdate(
        {
            label: `${batch.branch} - Year ${batch.academicYear}`,
            section: `${batch.section}-${batch.subsection}`
        },
        {
            $setOnInsert: {
                state: 'active',
                year: String(batch.academicYear),
                department: batch.branch,
                academicSession: term.name
            }
        },
        { upsert: true, new: true, runValidators: true }
    );
    const course = await Course.findOneAndUpdate(
        { code },
        { $setOnInsert: { name: subject, state: 'active' } },
        { upsert: true, new: true, runValidators: true }
    );
    let offering = await CourseOffering.findOneAndUpdate(
        { courseId: course._id, termId: term._id, classGroupId: group._id },
        { $setOnInsert: { state: 'active', assignments: [], enrolments: [], revision: 0 } },
        { upsert: true, new: true, runValidators: true }
    );
    offering = await A.changeOffering(offering.id, async (current) => {
        const assignments = current.assignments.map((a) => a.toObject()),
            enrolments = current.enrolments.map((e) => e.toObject());
        if (!assignments.some((a) => String(a.teacherId) === String(req.teacherId) && A.during(a, today)))
            assignments.push({
                teacherId: req.teacherId,
                startDate: today,
                endDate: term.endDate,
                state: 'active'
            });
        for (const student of students)
            if (!enrolments.some((e) => String(e.studentId) === String(student._id) && A.during(e, today)))
                enrolments.push({
                    studentId: student._id,
                    startDate: today,
                    endDate: term.endDate,
                    state: 'active'
                });
        return { assignments, enrolments };
    });
    await A.activeOffering(offering.id);
    const scheduledStart = new Date(`${today}T00:00:00+05:30`),
        scheduledEnd = new Date(`${today}T23:59:59+05:30`);
    try {
        return await LectureSession.create({
            offeringId: offering._id,
            teacherId: req.teacherId,
            campusDate: today,
            scheduledStart,
            scheduledEnd,
            batch,
            batchKey: key,
            createdBy: req.accountId,
            updatedBy: req.accountId
        });
    } catch (error) {
        if (error.code === 11000) {
            const doc = await LectureSession.findOne({
                teacherId: req.teacherId,
                campusDate: today,
                batchKey: key
            });
            if (doc) {
                await A.canMark(req, doc);
                return doc;
            }
        }
        throw error;
    }
}
async function view(doc) {
    const data = await A.populated(CourseOffering.findById(doc.offeringId));
    const teacher = await require('../models/Teacher').findById(doc.teacherId).select('name email subject');
    const roster = doc.attendanceStarted
        ? doc.roster
        : await A.roster(await A.offering(doc.offeringId), doc.campusDate);
    const batch = doc.batch?.branch ? doc.batch : null;
    return {
        id: doc.id,
        _id: doc._id,
        lectureId: doc._id,
        teacherId: String(doc.teacherId),
        teacher: teacher
            ? { id: teacher.id, name: teacher.name, email: teacher.email, subject: teacher.subject }
            : null,
        date: doc.scheduledStart,
        campusDate: doc.campusDate,
        className: batch?.branch || data?.classGroupId?.label || '',
        class: batch?.branch || data?.classGroupId?.label || '',
        section: batch ? `${batch.section}-${batch.subsection}` : data?.classGroupId?.section || '',
        subjectName: data?.courseId?.name || '',
        subject: data?.courseId?.name || '',
        sessionLabel: batch ? `Year ${batch.academicYear}` : data?.termId?.name || '',
        academicSession: data?.termId?.name || '',
        academicYear: batch?.academicYear,
        batch: batch || null,
        revision: doc.revision,
        source: doc.records.some((m) => ['face', 'photo'].includes(m.method)) ? 'face' : 'manual',
        finalised: doc.finalised,
        state: doc.state,
        records: doc.records.map((mark) => {
            const student = roster.find((s) => String(s.studentId) === String(mark.studentId));
            return {
                studentId: String(mark.studentId),
                studentName: student?.name || '',
                studentRollNo: student?.rollNo || '',
                status: mark.status,
                markedAt: mark.markedAt,
                source: ['face', 'photo'].includes(mark.method) ? 'face' : 'manual'
            };
        })
    };
}
async function read(req, from, to) {
    const filter = req.userRole === 'admin' ? {} : { teacherId: req.teacherId };
    if (req.query.teacherId && req.userRole === 'admin') filter.teacherId = A.id(req.query.teacherId);
    if (from || to) {
        if (from) A.day(from);
        if (to) A.day(to);
        if (from && to && from > to) A.fail(400, 'End date must follow start date.');
        filter.campusDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    for (const field of ['branch', 'section', 'subsection', 'academicYear'])
        if (req.query[field] && req.query[field] !== 'ALL')
            filter['batch.' + field] = field === 'academicYear' ? Number(req.query[field]) : req.query[field];
    const docs = await LectureSession.find(filter).sort({ scheduledStart: -1, _id: -1 }).limit(5001);
    if (docs.length > 5000) A.fail(413, 'Choose a narrower date range.');
    return Promise.all(docs.map(view));
}
function csv(items) {
    const cell = (value) => {
        const text = String(value ?? '');
        return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
    };
    const rows = [
        [
            'Date',
            'Session ID',
            'Subject',
            'Class',
            'Section',
            'Teacher',
            'Student ID',
            'Name',
            'Status',
            'Method',
            'Finalised'
        ]
    ];
    for (const s of items)
        for (const r of s.records)
            rows.push([
                s.campusDate,
                s.id,
                s.subjectName,
                s.className,
                s.section,
                s.teacher?.name,
                r.studentRollNo,
                r.studentName,
                r.status,
                r.source,
                String(s.finalised)
            ]);
    return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
module.exports = { ensure, view, read, csv, batchKey };
