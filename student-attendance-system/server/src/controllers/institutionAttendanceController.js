const { Types } = require('mongoose');
const { LectureSession } = require('../models/Academic');
const A = require('../services/academicService'),
    D = require('../services/administrationService'),
    B = require('../services/batchAttendanceService');
exports.list = D.wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1),
        limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    if (req.query.teacherId) filter.teacherId = A.id(req.query.teacherId);
    if (req.query.fromDate || req.query.toDate) {
        if (req.query.fromDate) A.day(req.query.fromDate);
        if (req.query.toDate) A.day(req.query.toDate);
        if (req.query.fromDate && req.query.toDate && req.query.fromDate > req.query.toDate)
            A.fail(400, 'Invalid date range.');
        filter.campusDate = {
            ...(req.query.fromDate ? { $gte: req.query.fromDate } : {}),
            ...(req.query.toDate ? { $lte: req.query.toDate } : {})
        };
    }
    const [docs, count] = await Promise.all([
        LectureSession.find(filter)
            .sort({ scheduledStart: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        LectureSession.countDocuments(filter)
    ]);
    res.json({
        success: true,
        count,
        page,
        totalPages: Math.ceil(count / limit),
        attendance: await Promise.all(docs.map(B.view))
    });
});
exports.correct = D.wrap(async (req, res) => {
    const { records, reason, revision } = req.body;
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 1000)
        A.fail(400, 'Provide a reason of 5–1000 characters.');
    if (
        !Number.isSafeInteger(revision) ||
        !Array.isArray(records) ||
        !records.length ||
        records.some(
            (r) => typeof r.studentRollNo !== 'string' || !['present', 'absent', 'late'].includes(r.status)
        ) ||
        new Set(records.map((r) => r.studentRollNo)).size !== records.length
    )
        A.fail(400, 'Provide the current revision and distinct, valid student records.');
    const operation = new Types.ObjectId(),
        at = new Date();
    const doc = await A.changeSession(
        req.params.id,
        async (current) => {
            if (current.revision !== revision) A.fail(409, 'Attendance changed. Refresh before correcting.');
            if (current.state !== 'completed' || !current.finalised)
                A.fail(409, 'Only completed, finalised sessions can be corrected.');
            if (records.some((r) => !current.roster.some((s) => s.rollNo === r.studentRollNo)))
                A.fail(400, 'A student is outside this saved session roster.');
            const marks = current.records.map((r) => r.toObject()),
                audit = (current.correctionAudit || []).map((a) => a.toObject());
            for (const record of records) {
                const student = current.roster.find((s) => s.rollNo === record.studentRollNo),
                    mark = marks.find((m) => String(m.studentId) === String(student.studentId));
                if (!mark) A.fail(409, 'The finalised attendance is incomplete.');
                if (mark.status === record.status) continue;
                audit.push({
                    requestId: operation,
                    studentId: mark.studentId,
                    previousStatus: mark.status,
                    newStatus: record.status,
                    actorId: req.accountId,
                    actorRole: 'admin',
                    reason: reason.trim(),
                    at,
                    previousEntryRevision: mark.correctionRevision || 0,
                    entryRevision: (mark.correctionRevision || 0) + 1,
                    sessionRevision: current.revision + 1,
                    originalMarkedAt: mark.markedAt,
                    originalMethod: mark.method
                });
                mark.status = record.status;
                mark.correctionRevision = (mark.correctionRevision || 0) + 1;
                mark.correctedAt = at;
                mark.correctedBy = req.accountId;
            }
            return { records: marks, correctionAudit: audit, updatedBy: req.accountId };
        },
        '+correctionAudit'
    );
    await D.audit(req, 'CORRECT_ATTENDANCE', 'LectureSession', doc.id, {
        reason: reason.trim(),
        operationId: String(operation)
    });
    res.json({ success: true, message: 'Attendance corrected', attendance: await B.view(doc) });
});
