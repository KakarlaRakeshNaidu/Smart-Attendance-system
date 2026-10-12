const { AcademicTerm, ClassGroup, Course, CourseOffering, LectureSession } = require('../models/Academic');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const face = require('../services/faceRecognitionService');
const A = require('../services/academicService');
const respondError = require('../utils/respondError');
const structures = { terms: AcademicTerm, classes: ClassGroup, courses: Course };
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { if (error.code === 11000) return res.status(409).json({success:false,message:'This academic record already exists. Offerings and identical lecture submissions must be unique.'}); respondError(res, error, 'Academic request failed.'); } };
const ok = (res, values, status = 200) => res.status(status).json({ success: true, ...values });
const isStaff = req => ['admin', 'teacher'].includes(req.userRole);
const ownStudent = req => { if (!req.account.studentProfileId) A.fail(403, 'Student profile not linked.'); return String(req.account.studentProfileId); };
exports.structures = wrap(async (req,res) => {
    const model = structures[req.params.kind]; if (!model) A.fail(404, 'Academic structure not found.');
    if (req.method === 'GET') return ok(res, { items: await model.find().sort({ createdAt: -1 }) });
    const b = req.body;
    let doc = req.params.id ? await model.findById(A.id(req.params.id)) : new model();
    if (!doc) A.fail(404, 'Academic record not found.');
    const state = b.state || doc.state;
    if (!['active','archived'].includes(state)) A.fail(400, 'Invalid lifecycle state.');
    if (req.params.kind === 'terms') {
        const start = b.startDate ?? doc.startDate, end = b.endDate ?? doc.endDate; A.range(start,end);
        if (!doc.isNew && (start !== doc.startDate || end !== doc.endDate) && await CourseOffering.exists({ termId: doc._id })) A.fail(409, 'Term dates are referenced. Preserve them and create a new term.');
        const minimum = b.minimumAttendancePercent === undefined ? (doc.minimumAttendancePercent ?? 75) : Number(b.minimumAttendancePercent);
        if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100) A.fail(400,'Attendance minimum must be between 0 and 100.');
        doc.set({ minimumAttendancePercent:minimum, name: A.text(b.name ?? doc.name,'Term name'), startDate: start, endDate: end, state });
    } else if (req.params.kind === 'classes') {
        doc.set({ label: A.text(b.label ?? doc.label,'Class label'), section: typeof (b.section ?? doc.section) === 'string' ? (b.section ?? doc.section).trim() : A.fail(400,'Section must be text.'), state });
    } else doc.set({ code: A.text(b.code ?? doc.code,'Course code').toUpperCase(), name: A.text(b.name ?? doc.name,'Course name'), state });
    await model.init(); await doc.save(); ok(res,{ item: doc },req.params.id ? 200 : 201);
});
exports.profiles = wrap(async (req,res) => {
    ok(res, { teachers: await Teacher.find().select('name email subject').sort({ name: 1 }), students: await Student.find().select('name studentId email class section').sort({ studentId: 1 }) });
});
exports.offerings = wrap(async (req,res) => {
    if (req.method === 'POST') {
        for (const [field,model] of [['courseId',Course],['termId',AcademicTerm],['classGroupId',ClassGroup]]) {
            const doc = await model.findById(A.id(req.body[field])); if (!doc || doc.state !== 'active') A.fail(400,'Select existing active course, term and class records.');
        }
        await CourseOffering.init();
        const item = await CourseOffering.create({ courseId: req.body.courseId, termId: req.body.termId, classGroupId: req.body.classGroupId });
        return ok(res,{ item },201);
    }
    if (req.userRole === 'student') return ok(res,{items:await require('../services/studentPortalService').courses(req)});
    let docs = await A.populated(CourseOffering.find().sort({ createdAt: -1 }));
    if (req.userRole === 'teacher') {
        if (!req.teacherId) A.fail(403,'Teacher profile not linked.');
        const taught = await LectureSession.distinct('offeringId',{ teacherId: req.teacherId });
        docs = docs.filter(d => d.assignments.some(a => String(a.teacherId?._id) === String(req.teacherId)) || taught.some(i => String(i) === String(d._id)));
    }
    if (req.userRole === 'student') {
        const mine = ownStudent(req);
        docs = docs.filter(d => d.enrolments.some(e => String(e.studentId?._id) === mine));
    }
    const items = docs.map(d => {
        const item = d.toObject();
        if (req.userRole === 'teacher') { delete item.enrolments; item.assignments = item.assignments.filter(a => String(a.teacherId?._id) === String(req.teacherId)); }
        if (req.userRole === 'student') { item.enrolments = item.enrolments.filter(e => String(e.studentId?._id) === ownStudent(req)); delete item.assignments; }
        return item;
    });
    ok(res,{ items });
});
exports.offeringDetail = wrap(async (req,res) => {
    if (req.userRole === 'student') { const item=await require('../services/studentPortalService').course(req,req.params.id); const date=req.query.date?A.day(req.query.date):A.campusDate(new Date()); return ok(res,{item,roster:(await A.roster(await A.offering(req.params.id),date)).filter(s=>String(s.studentId)===ownStudent(req))}); }
    const doc = await A.populated(CourseOffering.findById(A.id(req.params.id))); if (!doc) A.fail(404,'Offering not found.');
    const date = req.query.date ? A.day(req.query.date) : A.campusDate(new Date());
    if (req.userRole === 'teacher' && (!A.assigned(doc,req.teacherId,date) || !A.assigned(doc,req.teacherId,A.campusDate(new Date())))) A.fail(403,'No effective assignment for this roster date.');
    if (req.userRole === 'student') {
        const mine = ownStudent(req); if (!doc.enrolments.some(e => String(e.studentId?._id) === mine)) A.fail(403,'You are not enrolled in this offering.');
        const item = doc.toObject(); delete item.assignments; item.enrolments = item.enrolments.filter(e => String(e.studentId?._id) === mine);
        return ok(res,{ item, roster: (await A.roster(doc,date)).filter(s => String(s.studentId) === mine) });
    }
    ok(res,{ item: doc, roster: await A.roster(doc,date) });
});
exports.archiveOffering = wrap(async (req,res) => {
    if (!['active','archived'].includes(req.body.state)) A.fail(400,'Invalid state.');
    const item = await A.changeOffering(req.params.id, async () => ({ state: req.body.state }));
    ok(res,{ item });
});
exports.link = wrap(async (req,res) => {
    const key = req.params.kind === 'assignments' ? 'assignments' : req.params.kind === 'enrolments' ? 'enrolments' : A.fail(404,'Link type not found.');
    const field = key === 'assignments' ? 'teacherId' : 'studentId', model = key === 'assignments' ? Teacher : Student;
    const item = await A.changeOffering(req.params.id, async doc => {
        await A.activeOffering(doc._id);
        const term = await AcademicTerm.findById(doc.termId);
        if (req.params.linkId) {
            const row = doc[key].id(A.id(req.params.linkId)); if (!row) A.fail(404,'Assignment/enrolment not found.');
            const last = A.day(req.body.endDate); A.range(row.startDate,last);
            if (last > row.endDate) A.fail(400,'Withdrawal may shorten the effective range, not extend it.');
            row.endDate = last; row.state = 'withdrawn';
        } else {
            const reference = A.id(req.body[field]); if (!await model.exists({ _id: reference })) A.fail(400,'Select an existing academic profile, not an Account ID.');
            A.range(req.body.startDate,req.body.endDate);
            if (req.body.startDate < term.startDate || req.body.endDate > term.endDate) A.fail(400,'Effective dates must be within the selected term.');
            if (doc[key].some(r => String(r[field]) === reference && r.startDate <= req.body.endDate && r.endDate >= req.body.startDate)) A.fail(409,'An overlapping assignment/enrolment already exists.');
            doc[key].push({ [field]: reference, startDate: req.body.startDate, endDate: req.body.endDate });
        }
        return { [key]: doc[key].map(r => r.toObject()) };
    });
    ok(res,{ item },req.params.linkId ? 200 : 201);
});
exports.createSession = wrap(async (req,res) => {
    const doc = await A.activeOffering(req.body.offeringId), stamp = A.times(req.body);
    const teacherId = req.userRole === 'teacher' ? req.teacherId : A.id(req.body.teacherId);
    if (!teacherId || !A.assigned(doc,teacherId,stamp.campusDate) || (req.userRole === 'teacher' && !A.assigned(doc,teacherId,A.campusDate(new Date())))) A.fail(403,'Select a Teacher effectively assigned on the lecture date.');
    if (stamp.campusDate < doc.termId.startDate || A.campusDate(stamp.scheduledEnd) > doc.termId.endDate) A.fail(400,'Lecture must be within the term.');
    await LectureSession.init();
    const item = await LectureSession.create({ offeringId: doc._id, teacherId, ...stamp, createdBy: req.accountId, updatedBy: req.accountId });
    ok(res,{ item },201);
});
exports.sessions = wrap(async (req,res) => {
    if (req.userRole === 'student') { const P=require('../services/studentPortalService'); const result=await P.history(req,{...req.query,source:'sessions'}); const docs=await LectureSession.find({_id:{$in:result.items.map(s=>s.sessionId)}}); const byId=new Map(docs.map(s=>[String(s._id),s])); return ok(res,{items:await Promise.all(result.items.map(s=>P.sessionView(req,byId.get(s.sessionId)))),pagination:result.pagination}); }
    const filter = req.query.offeringId ? { offeringId: A.id(req.query.offeringId) } : {};
    if (req.userRole === 'teacher') { if (!req.teacherId) A.fail(403,'Teacher profile not linked.'); filter.teacherId = req.teacherId; }
    let docs = await LectureSession.find(filter).sort({ scheduledStart: -1 });
    if (req.userRole === 'student') {
        const mine = ownStudent(req), eligible = [];
        for (const s of docs) {
            const list = s.attendanceStarted ? s.roster : await A.roster(await A.offering(s.offeringId),s.campusDate);
            if (list.some(r => String(r.studentId) === mine)) eligible.push(s);
        }
        docs = eligible;
    }
    ok(res,{ items: await Promise.all(docs.map(s => A.view(req,s))) });
});
exports.getSession = wrap(async (req,res) => {
    const session = await LectureSession.findById(A.id(req.params.id)); if (!session) A.fail(404,'Session not found.');
    ok(res,{ item: await A.view(req,session) });
});
exports.manageSession = wrap(async (req,res) => {
    const result = await A.changeSession(req.params.id, async session => {
        if (req.userRole === 'teacher') {
            await A.canMark(req,session);
        } else if (session.finalised && req.body.state !== 'cancelled') A.fail(409,'Finalised attendance is immutable. A later correction workflow is required.');
        if (req.body.state === 'cancelled') {
            if (session.state === 'cancelled') A.fail(409,'Session already cancelled.');
            return { state: 'cancelled', cancellationReason: A.text(req.body.cancellationReason,'Cancellation reason'), updatedBy: req.accountId };
        }
        if (session.state !== 'scheduled' || session.attendanceStarted) A.fail(409,'Only a scheduled session whose attendance has not started can be rescheduled.');
        const doc = await A.activeOffering(session.offeringId), stamp = A.times(req.body);
        const teacherId = req.userRole === 'teacher' ? session.teacherId : req.body.teacherId ? A.id(req.body.teacherId) : session.teacherId;
        if (!A.assigned(doc,teacherId,stamp.campusDate)) A.fail(403,'Teacher is not assigned on the new lecture date.');
        if (stamp.campusDate < doc.termId.startDate || A.campusDate(stamp.scheduledEnd) > doc.termId.endDate) A.fail(400,'Lecture must be within the term.');
        return { ...stamp, teacherId, updatedBy: req.accountId };
    });
    ok(res,{ item: await A.view(req,result) });
});
async function markSession(req,records,method) {
    return A.changeSession(req.params.id, async session => {
        const doc = await A.canMark(req,session);
        const roster = session.attendanceStarted ? session.roster : await A.roster(doc,session.campusDate);
        if (!roster.length) A.fail(409,'No eligible students. Ask the Admin to enrol students before starting attendance.');
        if (!Array.isArray(records) || !records.length || records.some(r => !r || !['present','absent','late'].includes(r.status))) A.fail(400,'Provide attendance records with present, absent or late.');
        const ids = records.map(r => A.id(r.studentId));
        if (new Set(ids).size !== ids.length || ids.some(id => !roster.some(s => String(s.studentId) === id))) A.fail(400,'Only distinct students from this session roster can be marked.');
        const map = new Map(session.records.map(r => [String(r.studentId),r.toObject()]));
        for (const r of records) map.set(String(r.studentId),{ studentId: r.studentId, status: r.status, method, markedAt: new Date() });
        return { roster: roster.map(r => r.toObject ? r.toObject() : r), attendanceStarted: true, records: [...map.values()], updatedBy: req.accountId };
    });
}
exports.manual = wrap(async (req,res) => { const result = await markSession(req,req.body.records,'manual'); ok(res,{ item: await A.view(req,result) }); });
exports.reset = wrap(async (req,res) => {
    const result = await A.changeSession(req.params.id, async session => { await A.canMark(req,session); return { records: [], updatedBy: req.accountId }; });
    ok(res,{ item: await A.view(req,result), message: 'Marks cleared; the captured roster remains unchanged.' });
});
exports.finalise = wrap(async (req,res) => {
    const result = await A.changeSession(req.params.id, async session => {
        const doc = await A.canMark(req,session);
        if (session.scheduledStart > new Date()) A.fail(409,'A future lecture cannot be finalised.');
        const roster = session.attendanceStarted ? session.roster : await A.roster(doc,session.campusDate);
        if (!roster.length) A.fail(409,'Cannot finalise a lecture with no eligible roster.');
        const records = session.records.map(r => r.toObject());
        for (const s of roster) if (!records.some(r => String(r.studentId) === String(s.studentId))) records.push({ studentId: s.studentId, status: 'absent', method: 'finalisation', markedAt: new Date() });
        return { roster: roster.map(r => r.toObject ? r.toObject() : r), records, attendanceStarted: true, finalised: true, finalisedAt: new Date(), state: 'completed', updatedBy: req.accountId };
    });
    ok(res,{ item: await A.view(req,result) });
});
exports.recognise = wrap(async (req,res) => {
    const session = await A.changeSession(req.params.id, async current => {
        const doc = await A.canMark(req,current);
        const roster = current.attendanceStarted ? current.roster : await A.roster(doc,current.campusDate);
        if (!roster.length) A.fail(409,'No eligible session candidates. Global matching is disabled.');
        return { roster:roster.map(r=>r.toObject?r.toObject():r), attendanceStarted:true, updatedBy:req.accountId };
    });
    const roster = session.roster;
    if (typeof req.body.image !== 'string' || !req.body.image) A.fail(400,'An image is required.');
    // Candidate IDs come only from the authorised roster. Browser candidate fields are ignored.
    const candidates = roster.map(s => s.rollNo);
    const single = req.body.mode === 'single';
    const result = await (single ? face.recognizeFace(req.body.image,candidates) : face.recognizeMultipleFaces(req.body.image,candidates));
    if (!result.success) A.fail(result.httpStatus || 400,result.message || 'No eligible face recognised.',result.code);
    const matches = single ? result.students : result.recognizedStudents;
    if (!Array.isArray(matches)) A.fail(502,'Face service returned invalid matches.');
    const ids = [...new Set(matches.map(s => s?.studentId))];
    if (ids.some(id => !candidates.includes(id))) A.fail(502,'Face service returned a student outside this session roster. No attendance saved.');
    if (!ids.length) return ok(res,{ message: 'No eligible matches; nothing marked.', unrecognizedCount: result.unrecognizedCount || 0 });
    const records = ids.map(id => ({ studentId: roster.find(s => s.rollNo === id).studentId, status: 'present' }));
    const changed = await markSession(req,records,req.body.method === 'photo' ? 'photo' : 'face');
    ok(res,{ item: await A.view(req,changed), message: ids.length + ' eligible student(s) marked present.', totalFaces:result.totalFaces, recognized:matches.map(m=>({studentId:m.studentId,name:roster.find(s=>s.rollNo===m.studentId).name,confidence:m.confidence})),
        alreadyMarked:single && session.records.some(r=>String(r.studentId)===String(records[0].studentId)&&r.status==='present'),
        alreadyMarkedStudents:matches.filter(m=>session.records.some(r=>String(r.studentId)===String(roster.find(s=>s.rollNo===m.studentId).studentId)&&r.status==='present')).map(m=>({studentId:m.studentId,name:roster.find(s=>s.rollNo===m.studentId).name,confidence:m.confidence})), unrecognizedCount: result.unrecognizedCount || 0 });
});
exports.exportSession = wrap(async (req,res) => {
    if (!isStaff(req)) A.fail(403,'Students cannot export classmates.');
    const session = await LectureSession.findById(A.id(req.params.id)); if (!session) A.fail(404,'Session not found.');
    const item = await A.view(req,session);
    const header = ['Session ID','Course code','Course','Term','Class','Section','Start (Asia/Kolkata)','End (Asia/Kolkata)','Teacher','State','Finalised','Student ID','Name','Status'];
    const rows = item.roster.map(s => {
        const mark = item.records.find(r => String(r.studentId) === String(s.studentId));
        return [String(item._id),item.offering.course?.code,item.offering.course?.name,item.offering.term?.name,item.offering.classGroup?.label,item.offering.classGroup?.section,
            new Date(item.scheduledStart).toLocaleString('en-GB',{timeZone:'Asia/Kolkata'}),new Date(item.scheduledEnd).toLocaleString('en-GB',{timeZone:'Asia/Kolkata'}),
            item.teacher?.name,item.state,String(item.finalised),s.rollNo,s.name,mark?.status || 'not marked'];
    });
    const csv = values => values.map(v => { const value = String(v ?? ''); return '"' + (/^[=+@-]/.test(value) ? "'" + value : value).replace(/"/g,'""') + '"'; }).join(',');
    res.set({ 'Content-Type':'text/csv', 'Content-Disposition':'attachment; filename="session-' + session._id + '.csv"' }).send([header,...rows].map(csv).join('\r\n'));
});
exports.mySummary = wrap(async (req,res) => { ok(res,{items:await require('../services/studentPortalService').summaries(req)}); });
exports.legacyList = wrap(async (req,res) => {
    if(req.userRole==='student')await require('../services/studentPortalService').identity(req);
    const filter = req.userRole === 'teacher' ? { teacherId:req.teacherId } : req.userRole === 'student' ? { 'records.studentId': ownStudent(req) } : {};
    const docs = await Attendance.find(filter).sort({ date:-1 }).lean();
    const mapped = await LectureSession.find({ legacyAttendanceId: { $in:docs.map(d => d._id) } }).select('legacyAttendanceId');
    for (const d of docs) { d.label = 'Legacy attendance'; d.mapped = mapped.some(s => String(s.legacyAttendanceId) === String(d._id)); if (req.userRole === 'student') d.records = d.records.filter(r => String(r.studentId) === ownStudent(req)); }
    ok(res,{ items:docs });
});
exports.mapLegacy = wrap(async (req,res) => {
    const legacy = await Attendance.findById(A.id(req.params.id)); if (!legacy) A.fail(404,'Legacy record not found.');
    const existing = await LectureSession.findOne({ legacyAttendanceId:legacy._id });
    if (existing) {
        if (String(existing.offeringId) !== A.id(req.body.offeringId) || existing.scheduledStart.toISOString() !== A.times(req.body).scheduledStart.toISOString() || existing.scheduledEnd.toISOString() !== A.times(req.body).scheduledEnd.toISOString()) A.fail(409,'This record is already mapped with different inputs.');
        return ok(res,{ item:existing, alreadyMapped:true });
    }
    const doc = await A.activeOffering(req.body.offeringId), stamp = A.times(req.body);
    if (stamp.campusDate !== A.campusDate(legacy.date)) A.fail(400,'Choose the actual campus lecture date from the legacy record.');
    if (!A.assigned(doc,legacy.teacherId,stamp.campusDate)) A.fail(400,'Legacy Teacher must be explicitly assigned on this date.');
    if (stamp.campusDate < doc.termId.startDate || A.campusDate(stamp.scheduledEnd) > doc.termId.endDate) A.fail(400,'Mapping must be within the term.');
    const roster = await A.roster(doc,stamp.campusDate), ids = legacy.records.map(r => String(r.studentId));
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !roster.some(s => String(s.studentId) === id))) A.fail(409,'Ambiguous mapping: empty/duplicate legacy marks or students outside the selected effective enrolments. Review the source and mappings.');
    const records = legacy.records.map(r => ({ studentId:r.studentId, status:r.status, markedAt:r.markedAt || legacy.date, method:'legacy' }));
    // Legacy has no proof of finalisation: never invent absence for missing records.
    const values = { offeringId:doc._id, teacherId:legacy.teacherId, ...stamp, roster, records, attendanceStarted:true, state:'scheduled',
        legacyAttendanceId:legacy._id, createdBy:req.accountId, updatedBy:req.accountId };
    if (req.params.action === 'preview') return ok(res,{ preview:values, message:'Original document remains unchanged. Imported marks are unfinalised; missing students remain not marked.' });
    try { await LectureSession.init(); const item = await LectureSession.create(values); ok(res,{ item },201); }
    catch (e) {
        if (e.code === 11000) { const item = await LectureSession.findOne({ legacyAttendanceId:legacy._id }); if (item) {
            if (String(item.offeringId) !== String(values.offeringId) || item.scheduledStart.getTime() !== values.scheduledStart.getTime() || item.scheduledEnd.getTime() !== values.scheduledEnd.getTime()) A.fail(409,'Concurrent mapping used different inputs. Review the existing mapping.');
            return ok(res,{ item,alreadyMapped:true });
        } }
        throw e;
    }
});
