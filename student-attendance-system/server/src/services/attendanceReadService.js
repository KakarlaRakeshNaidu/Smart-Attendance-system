const Attendance = require('../models/Attendance');
const { LectureSession } = require('../models/Academic');
const A = require('./academicService');

const dayRange = value => {
    const day = A.day(value);
    return { start:new Date(day + 'T00:00:00+05:30'), end:new Date(day + 'T23:59:59.999+05:30') };
};
// Read projections only: LectureSession remains the authoritative session record.
async function read(req, from, to) {
    if (!['teacher','admin'].includes(req.userRole)) A.fail(403,'Only staff may read class attendance.');
    const source = req.query.source || 'all';
    if (!['all','legacy','sessions'].includes(source)) A.fail(400,'Invalid attendance source.');
    const scope = req.userRole === 'teacher' ? {teacherId:req.teacherId} :
        req.query.teacherId ? {teacherId:A.id(req.query.teacherId)} : {};
    let dates;
    if (from || to) {
        const start = dayRange(from).start, end = dayRange(to || from).end;
        if (start > end || end - start > 367 * 86400000) A.fail(400,'Choose an ordered range of at most 366 days.');
        dates = {$gte:start,$lte:end};
    }
    const result = [];
    if (source !== 'sessions') {
        const legacy = await Attendance.find({...scope,...(dates ? {date:dates} : {})}).lean();
        result.push(...legacy.map(d => ({...d,recordType:'Legacy attendance'})));
    }
    if (source !== 'legacy') {
        const sessions = await LectureSession.find({...scope,...(dates ? {scheduledStart:dates} : {})});
        for (const s of sessions) {
            const item = await A.view(req,s);
            result.push({_id:item._id,sessionId:item._id,recordType:'Session attendance',date:item.scheduledStart,
                scheduledEnd:item.scheduledEnd,teacherId:item.teacherId,teacherName:item.teacher?.name,
                subject:[item.offering?.course?.code,item.offering?.course?.name].filter(Boolean).join(' · '),
                class:item.offering?.classGroup?.label || '',section:item.offering?.classGroup?.section || '',
                term:item.offering?.term?.name || '',state:item.state,finalised:item.finalised,canMark:item.canMark,
                records:item.roster.map(r => {
                    const mark = item.records.find(m => String(m.studentId) === String(r.studentId));
                    return {studentId:r.studentId,studentName:r.name,studentRollNo:r.rollNo,status:mark?.status || 'not marked',markedAt:mark?.markedAt};
                })});
        }
    }
    return result.sort((a,b) => new Date(b.date) - new Date(a.date) || String(a._id).localeCompare(String(b._id)));
}
function csv(documents) {
    const columns = ['S.No','Record type','Legacy record ID','Session ID','Start (Asia/Kolkata)','End (Asia/Kolkata)','Teacher ID','Subject','Term','Class','Section','Session state','Finalised','Student ID','Name','Status','Time Marked'];
    const escape = value => {const text = String(value ?? '');return '"' + (/^[=+@-]/.test(text) ? "'" : '') + text.replace(/"/g,'""') + '"';};
    const campus = value => value ? new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Kolkata'}) : '';
    const rows = [];
    for (const d of documents) for (const r of d.records) rows.push([rows.length+1,d.recordType,d.sessionId ? '' : String(d._id),d.sessionId || '',
        campus(d.date),campus(d.scheduledEnd),String(d.teacherId),d.subject,d.term,d.class,d.section,d.state,d.finalised ?? '',r.studentRollNo,r.studentName,r.status,campus(r.markedAt)]);
    return [columns,...rows].map(row => row.map(escape).join(',')).join('\r\n');
}
module.exports = { read,csv,dayRange };