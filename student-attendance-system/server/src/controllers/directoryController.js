const crypto = require('crypto');
const Account = require('../models/Account');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { CourseOffering, LectureSession, ClassGroup, Course } = require('../models/Academic');
const { TeacherAcademicAccess, AuditLog } = require('../models/Administration');
const A = require('../services/academicService');
const D = require('../services/administrationService');
const ok = (res, data, status = 200) => res.status(status).json({ success: true, ...data });
const model = (req) => (req.params.kind === 'teachers' ? Teacher : Student);
const profileKey = (req) => (req.params.kind === 'teachers' ? 'teacherProfileId' : 'studentProfileId');
const noun = (req) => (req.params.kind === 'teachers' ? 'Teacher' : 'Student');
const action = (req, verb) => verb + '_' + noun(req).toUpperCase();
const pick = (body, keys) =>
    Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
async function enrich(doc, kind) {
    const item = D.plain(doc);
    const account = await Account.findOne({
        [kind === 'teachers' ? 'teacherProfileId' : 'studentProfileId']: doc._id
    }).lean();
    item.userId = account ? String(account._id) : null;
    item.user = account
        ? {
              id: String(account._id),
              name: account.name,
              email: account.email,
              status: account.isActive ? 'active' : 'inactive'
          }
        : null;
    if (kind === 'teachers')
        item.academicAccess = (
            await TeacherAcademicAccess.find({ teacherId: doc._id }).sort({
                academicYear: 1,
                branch: 1,
                section: 1,
                subsection: 1
            })
        ).map(D.plain);
    return item;
}
exports.stats = D.wrap(async (req, res) => {
    const [totalTeachers, totalStudents, totalClasses, totalSubjects, todayAttendanceCount, recentAuditLogs] =
        await Promise.all([
            Teacher.countDocuments({ status: { $ne: 'archived' } }),
            Student.countDocuments({ status: { $ne: 'archived' } }),
            ClassGroup.countDocuments({ state: 'active' }),
            Course.countDocuments({ state: 'active' }),
            LectureSession.countDocuments({
                campusDate: A.campusDate(new Date()),
                state: { $ne: 'cancelled' }
            }),
            AuditLog.find().sort({ createdAt: -1, _id: -1 }).limit(10).lean()
        ]);
    ok(res, {
        stats: {
            totalTeachers,
            totalStudents,
            totalClasses,
            totalSubjects,
            todayAttendanceCount,
            recentAuditLogs: recentAuditLogs.map(D.plain)
        }
    });
});
exports.list = D.wrap(async (req, res) => {
    const filter = {};
    const status = req.query.status || 'active';
    if (!['active', 'inactive', 'archived', 'all'].includes(status)) A.fail(400, 'Invalid account status.');
    if (status === 'active') filter.status = { $nin: ['archived', 'inactive'] };
    else if (status !== 'all') filter.status = status;
    if (req.query.search) {
        const search = new RegExp(D.escape(req.query.search), 'i');
        filter.$or = [
            { name: search },
            { email: search },
            ...(req.params.kind === 'students' ? [{ studentId: search }] : [])
        ];
    }
    if (req.params.kind === 'students')
        for (const key of ['academicYear', 'branch', 'section', 'subsection'])
            if (req.query[key] && req.query[key] !== 'all')
                filter[key] = key === 'academicYear' ? Number(req.query[key]) : req.query[key];
    const docs = await model(req).find(filter).sort({ name: 1, _id: 1 });
    const items = await Promise.all(docs.map((d) => enrich(d, req.params.kind)));
    ok(res, { count: items.length, [req.params.kind]: items });
});
exports.create = D.wrap(async (req, res) => {
    const teacher = req.params.kind === 'teachers';
    const { name, studentId } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;
    A.text(name, 'Name');
    if (teacher && (!email || !password)) A.fail(400, 'Email and password are required.');
    if (!teacher && (typeof studentId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(studentId)))
        A.fail(400, 'Use a valid student roll number.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) A.fail(400, 'Use a valid email.');
    if (password && (typeof password !== 'string' || password.length < 6))
        A.fail(400, 'Password must contain at least six characters.');
    if (password && !email) A.fail(400, 'An email is required to create a login account.');
    if (email && (await Account.exists({ email }))) A.fail(409, 'Email is already in use.');
    const extra = teacher
        ? pick(req.body, ['subject', 'description'])
        : {
              studentId,
              ...D.academicFields(req.body),
              class: req.body.class || `${req.body.branch || 'CSE'} - Year ${req.body.academicYear || 1}`
          };
    const values = {
        ...(req.userRole === 'teacher' && !teacher ? { registeredBy: req.teacherId } : {}),
        name: name.trim(),
        ...(email ? { email } : {}),
        ...extra,
        status: 'active'
    };
    if (teacher) values.password = password;
    if (req.file)
        values.profilePhoto = '/uploads/' + req.file.path.replace(/\\/g, '/').split('/uploads/').pop();
    let profile,
        account,
        invitation = null;
    try {
        profile = await model(req).create(values);
        if (email) {
            account = new Account({
                name: profile.name,
                email,
                role: teacher ? 'teacher' : 'student',
                isActive: Boolean(password),
                [profileKey(req)]: profile._id
            });
            await account.setPassword(password || crypto.randomBytes(32).toString('hex'));
            if (!password) {
                const token = account.generateActivationToken();
                invitation = {
                    activationUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/activate?token=${token}`,
                    expiresAt: account.activationTokenExpiry
                };
            }
            await account.save();
        }
    } catch (error) {
        if (account && !account.isNew) await Account.deleteOne({ _id: account._id });
        if (profile) await model(req).deleteOne({ _id: profile._id });
        throw error;
    }
    let faceWarning = null;
    if (!teacher && req.body.faceImage) {
        try {
            const result = await require('../services/faceRecognitionService').addStudent(
                profile.studentId,
                profile.name,
                req.body.faceImage
            );
            if (!result.success) faceWarning = result.message || 'Face registration failed.';
            else {
                profile.faceEmbedding = result.embedding || [];
                await profile.save();
            }
        } catch {
            faceWarning = 'Face service unavailable. Register the face from the student directory later.';
        }
    }
    await D.audit(req, action(req, 'CREATE'), noun(req), profile.id, { name: profile.name, email, ...extra });
    ok(
        res,
        {
            [teacher ? 'teacher' : 'student']: await enrich(profile, req.params.kind),
            invitation,
            faceWarning,
            message: `${noun(req)} created${faceWarning ? '. ' + faceWarning : ''}`
        },
        201
    );
});
exports.update = D.wrap(async (req, res) => {
    const doc = await model(req).findById(A.id(req.params.id));
    if (!doc) A.fail(404, 'Profile not found.');
    const values = pick(
        req.body,
        req.params.kind === 'teachers'
            ? ['name', 'email', 'subject', 'description']
            : ['name', 'email', 'studentId', 'class']
    );
    if (values.name !== undefined) values.name = A.text(values.name, 'Name');
    if (values.email !== undefined) {
        if (typeof values.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
            A.fail(400, 'Use a valid email.');
        values.email = values.email.trim().toLowerCase();
    }
    if (req.params.kind === 'students') Object.assign(values, D.academicFields(req.body, doc));
    const account = await Account.findOne({ [profileKey(req)]: doc._id });
    if (
        values.email &&
        (await Account.exists({ email: values.email, ...(account ? { _id: { $ne: account._id } } : {}) }))
    )
        A.fail(409, 'Email is already in use.');
    const old = pick(doc, Object.keys(values));
    Object.assign(doc, values);
    await doc.save();
    try {
        if (account) {
            Object.assign(account, pick(values, ['name', 'email']));
            await account.save();
        }
    } catch (error) {
        Object.assign(doc, old);
        await doc.save();
        throw error;
    }
    await D.audit(req, action(req, 'UPDATE'), noun(req), doc.id, values);
    ok(res, { [req.params.kind === 'teachers' ? 'teacher' : 'student']: await enrich(doc, req.params.kind) });
});
exports.archive = D.wrap(async (req, res) => {
    const doc = await model(req).findById(A.id(req.params.id)).select('+accountWasActive');
    if (!doc) A.fail(404, 'Profile not found.');
    const account = await Account.findOne({ [profileKey(req)]: doc._id }).select('+activationTokenHash');
    if (doc.status !== 'archived') {
        doc.accountWasActive = Boolean(account?.isActive);
        doc.status = 'archived';
        if (account) account.isActive = false;
    } else {
        doc.status = 'active';
        if (account) account.isActive = doc.accountWasActive === true && !account.activationTokenHash;
    }
    await doc.save();
    if (account) await account.save();
    await D.audit(req, action(req, doc.status === 'active' ? 'RESTORE' : 'ARCHIVE'), noun(req), doc.id, {
        status: doc.status
    });
    ok(res, { message: `${noun(req)} ${doc.status === 'active' ? 'restored' : 'archived'}` });
});
exports.remove = D.wrap(async (req, res) => {
    if (req.query.archive === 'true') return exports.archive(req, res);
    const doc = await model(req).findById(A.id(req.params.id));
    if (!doc) A.fail(404, 'Profile not found.');
    const teacher = req.params.kind === 'teachers';
    const used =
        (await LectureSession.exists(teacher ? { teacherId: doc._id } : { 'roster.studentId': doc._id })) ||
        (await Attendance.exists(teacher ? { teacherId: doc._id } : { 'records.studentId': doc._id })) ||
        (await CourseOffering.exists(
            teacher ? { 'assignments.teacherId': doc._id } : { 'enrolments.studentId': doc._id }
        ));
    if (used)
        A.fail(409, 'This profile has academic history. Archive it to preserve attendance and reports.');
    await D.audit(req, action(req, 'DELETE'), noun(req), doc.id, { name: doc.name, email: doc.email });
    await Account.deleteOne({ [profileKey(req)]: doc._id });
    if (teacher) {
        await TeacherAcademicAccess.deleteMany({ teacherId: doc._id });
        await Student.updateMany({ registeredBy: doc._id }, { $unset: { registeredBy: 1 } });
    }
    await doc.deleteOne();
    ok(res, { message: `${noun(req)} deleted` });
});
exports.resetPassword = D.wrap(async (req, res) => {
    const password = req.body.newPassword;
    if (typeof password !== 'string' || password.length < 6)
        A.fail(400, 'Password must contain at least six characters.');
    const account = await Account.findOne({ [profileKey(req)]: A.id(req.params.id) }).select('+passwordHash');
    if (!account) A.fail(404, 'No linked login account. Use account activation to create one.');
    await account.setPassword(password);
    await account.save();
    await D.audit(req, action(req, 'RESET_PASSWORD'), noun(req), req.params.id);
    ok(res, { message: 'Password reset' });
});
exports.getAccess = D.wrap(async (req, res) => {
    const teacherId = req.params.id ? A.id(req.params.id) : req.teacherId;
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) A.fail(404, 'Teacher not found.');
    const access = (
        await TeacherAcademicAccess.find({ teacherId }).sort({
            academicYear: 1,
            branch: 1,
            section: 1,
            subsection: 1
        })
    ).map(D.plain);
    ok(res, { count: access.length, access, teacher: D.plain(teacher) });
});
exports.grantAccess = D.wrap(async (req, res) => {
    const teacherId = A.id(req.params.id);
    if (!(await Teacher.exists({ _id: teacherId }))) A.fail(404, 'Teacher not found.');
    const batch = D.accessFields(req.body);
    const access = await TeacherAcademicAccess.findOneAndUpdate(
        { teacherId, ...batch },
        { $setOnInsert: { teacherId, ...batch, assignedById: req.accountId } },
        { upsert: true, new: true, runValidators: true }
    );
    await D.audit(req, 'ASSIGN_TEACHER_ACCESS', 'Teacher', teacherId, batch);
    ok(res, { access: D.plain(access), message: 'Academic access granted' });
});
exports.revokeAccess = D.wrap(async (req, res) => {
    const access = await TeacherAcademicAccess.findOne({
        _id: A.id(req.params.accessId),
        teacherId: A.id(req.params.id)
    });
    if (!access) A.fail(404, 'Access not found.');
    await access.deleteOne();
    await D.audit(req, 'REVOKE_TEACHER_ACCESS', 'Teacher', req.params.id, D.plain(access));
    ok(res, { message: 'Academic access revoked' });
});
exports.auditLogs = D.wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1),
        limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = req.query.action ? { action: new RegExp(D.escape(req.query.action), 'i') } : {};
    const [docs, count] = await Promise.all([
        AuditLog.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        AuditLog.countDocuments(filter)
    ]);
    ok(res, { logs: docs.map(D.plain), count, page, totalPages: Math.ceil(count / limit) });
});
