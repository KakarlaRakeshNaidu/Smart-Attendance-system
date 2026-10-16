const mongoose = require('mongoose');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const {CourseOffering,LectureSession} = require('../models/Academic');
const A = require('./academicService');
async function profile(req) {
    if (!req.account?.studentProfileId) A.fail(403,'Your Student profile is not linked. Contact an Administrator.','PROFILE_UNAVAILABLE');
    if (!req.studentProfile) req.studentProfile = await Student.findById(req.account.studentProfileId).select('name studentId email class section profilePhoto');
    if (!req.studentProfile) A.fail(403,'Your linked Student profile is unavailable. Contact an Administrator.','PROFILE_UNAVAILABLE');
    const s = req.studentProfile;
    return {_id:s._id,name:s.name,studentId:s.studentId,email:req.account.email,class:s.class,section:s.section,profilePhoto:s.profilePhoto};
}
async function identity(req) { await profile(req); return req.studentProfile._id; }
const contexts = query => query.populate('courseId','code name state').populate('termId','name startDate endDate state').populate('classGroupId','label section state');
// This is the single percentage calculation used by the overview, courses and existing /my-summary.
async function summaries(req) { return require('./attendanceAnalyticsService').personalSummaries(req); }
async function courses(req) {
    const mine = await identity(req), today = A.campusDate(new Date());
    const frozen = await LectureSession.distinct('offeringId',{'roster.studentId':mine,attendanceStarted:true});
    const docs = await contexts(CourseOffering.find({$or:[{'enrolments.studentId':mine},{_id:{$in:frozen}}]})).populate('assignments.teacherId','name subject').lean();
    const summary = new Map((await summaries(req)).map(s=>[String(s.offeringId),s]));
    return docs.map(d=>{
        const enrolments=d.enrolments.filter(e=>String(e.studentId)===String(mine)).map(e=>({_id:e._id,studentId:mine,startDate:e.startDate,endDate:e.endDate,state:e.state}));
        const active=d.state==='active'&&[d.courseId,d.termId,d.classGroupId].every(x=>x?.state==='active')&&enrolments.some(e=>A.during(e,today));
        return {_id:d._id,offeringId:d._id,state:d.state,course:d.courseId,term:d.termId,classGroup:d.classGroupId,courseId:d.courseId,termId:d.termId,classGroupId:d.classGroupId,enrolments,
            enrolmentStatus:active?'active':enrolments.some(e=>e.startDate>today)?'upcoming':'historical',
            teachers:d.assignments.filter(a=>a.teacherId).map(a=>({name:a.teacherId.name,subject:a.teacherId.subject,startDate:a.startDate,endDate:a.endDate,state:a.state})),
            summary:summary.get(String(d._id))||{total:0,present:0,percentage:null}};
    }).sort((a,b)=>(a.course?.code||'').localeCompare(b.course?.code||'')||String(a._id).localeCompare(String(b._id)));
}
async function course(req,value) { const key=A.id(value), item=(await courses(req)).find(c=>String(c._id)===key); if(!item)A.fail(403,'This course offering is not part of your enrolment or attendance history.'); return item; }
async function sessionView(req,s) {
    await identity(req); await A.canRead(req,s);
    const offering=await contexts(CourseOffering.findById(s.offeringId)).lean();
    const teacher=await require('../models/Teacher').findById(s.teacherId).select('name subject').lean();
    const list=s.attendanceStarted?s.roster:await A.roster(await A.offering(s.offeringId),s.campusDate);
    const mine=String(req.studentProfile._id);
    return {_id:s._id,offeringId:s.offeringId,teacherId:s.teacherId,scheduledStart:s.scheduledStart,scheduledEnd:s.scheduledEnd,campusDate:s.campusDate,state:s.state,finalised:s.finalised,finalisedAt:s.finalisedAt,
        attendanceStarted:s.attendanceStarted,cancellationReason:s.cancellationReason,canMark:false,
        offering:offering?{_id:offering._id,course:offering.courseId,term:offering.termId,classGroup:offering.classGroupId}:null,
        teacher:teacher?{name:teacher.name,subject:teacher.subject}:null,
        roster:list.filter(r=>String(r.studentId)===mine).map(r=>({studentId:r.studentId,name:r.name,rollNo:r.rollNo})),
        records:s.records.filter(r=>String(r.studentId)===mine).map(r=>({studentId:r.studentId,status:r.status,markedAt:r.markedAt,method:r.method,correctedAt:r.correctedAt}))};
}
const integer = (value,fallback,max,label) => { if(value===undefined)return fallback; if(typeof value!=='string'||!/^\d+$/.test(value)||Number(value)<1||Number(value)>max)A.fail(400,'Invalid '+label+'.');return Number(value); };
async function history(req, query={}) {
    const mine=await identity(req), page=integer(query.page,1,10000,'page'),limit=integer(query.limit,20,100,'page size');
    for(const key of ['offeringId','termId','from','to','status','source'])if(query[key]!==undefined&&typeof query[key]!=='string')A.fail(400,'Invalid '+key+' filter.');
    const source=query.source||'all', status=query.status||'';
    if(!['all','sessions','legacy'].includes(source)||!['','present','absent','late','not-marked','cancelled'].includes(status))A.fail(400,'Invalid attendance filter.');
    if(query.from)A.day(query.from);if(query.to)A.day(query.to);
    if(query.from&&query.to){A.range(query.from,query.to);if(new Date(query.to)-new Date(query.from)>365*86400000)A.fail(400,'Choose an inclusive date range of at most 366 days.');}
    const dates={};if(query.from)dates.$gte=new Date(query.from+'T00:00:00+05:30');if(query.to)dates.$lte=new Date(query.to+'T23:59:59.999+05:30');
    const offeringId=query.offeringId?new mongoose.Types.ObjectId(A.id(query.offeringId)):null;
    if(offeringId)await course(req,offeringId);
    const termId=query.termId?new mongoose.Types.ObjectId(A.id(query.termId)):null;
    const enrolled=await CourseOffering.find({'enrolments.studentId':mine}).select('enrolments').lean();
    const eligible=[{attendanceStarted:true,'roster.studentId':mine}];
    for(const o of enrolled)for(const e of o.enrolments.filter(e=>String(e.studentId)===String(mine)))eligible.push({attendanceStarted:false,offeringId:o._id,campusDate:{$gte:e.startDate,$lte:e.endDate}});
    const filter={$or:eligible};if(Object.keys(dates).length)filter.scheduledStart=dates;if(offeringId)filter.offeringId=offeringId;
    if(termId)filter.offeringId={$in:await CourseOffering.distinct('_id',{termId,...(offeringId?{_id:offeringId}:{})})};
    if(status==='cancelled')filter.state='cancelled';
    else if(status){filter.state={$ne:'cancelled'};filter.records=status==='not-marked'?{$not:{$elemMatch:{studentId:mine}}}:{$elemMatch:{studentId:mine,status}};}
    const ownMark={$arrayElemAt:[{$filter:{input:'$records',as:'mark',cond:{$eq:['$$mark.studentId',mine]}}},0]};
    const pipeline=[{$match:source==='legacy'?{_id:{$exists:false}}:filter},{$project:{_id:1,date:'$scheduledStart',offeringId:1,source:{$literal:'sessions'},record:ownMark,correctionPendingId:'$correctionSlots.'+String(mine)+'.current._id'}}];
    if(source!=='sessions'&&!offeringId&&!termId){
        const legacyFilter={'records.studentId':mine,...(Object.keys(dates).length?{date:dates}:{})};
        if(['not-marked','cancelled'].includes(status))legacyFilter._id={$exists:false};else if(status)legacyFilter.records={$elemMatch:{studentId:mine,status}};
        pipeline.push({$unionWith:{coll:Attendance.collection.name,pipeline:[{$match:legacyFilter},
            {$lookup:{from:LectureSession.collection.name,localField:'_id',foreignField:'legacyAttendanceId',as:'mapped'}},{$match:{mapped:{$size:0}}},
            {$project:{_id:1,date:1,subject:1,class:1,section:1,source:{$literal:'legacy'},record:ownMark}}]}});
    }
    pipeline.push({$sort:{date:-1,_id:-1,source:1}},{$facet:{items:[{$skip:(page-1)*limit},{$limit:limit}],count:[{$count:'total'}]}});
    const [result]=await LectureSession.aggregate(pipeline);const total=result.count[0]?.total||0;
    const items=await Promise.all(result.items.map(async row=>{
        if(row.source==='legacy')return {id:String(row._id),recordType:'Legacy attendance',date:row.date,subject:row.subject||'',class:row.class||'',section:row.section||'',status:row.record?.status||'not marked',markedAt:row.record?.markedAt,provisional:false,correctionUnavailableReason:'Unmapped legacy attendance cannot be corrected. A verified session mapping is required.'};
        const s=await LectureSession.findById(row._id);const v=await sessionView(req,s);return {id:String(s._id),sessionId:String(s._id),recordType:'Session attendance',date:v.scheduledStart,end:v.scheduledEnd,offering:v.offering,teacher:v.teacher,state:v.state,finalised:v.finalised,
            status:v.state==='cancelled'?'cancelled':v.records[0]?.status||'not marked',markedAt:v.records[0]?.markedAt,correctedAt:v.records[0]?.correctedAt,provisional:v.state!=='cancelled'&&!v.finalised,
            correctionPendingId:row.correctionPendingId||null,correctionAvailable:require('./correctionService').eligibility(s,mine).available,
            correctionUnavailableReason:require('./correctionService').eligibility(s,mine).reason};
    }));
    return {items,pagination:{page,limit,total,pages:Math.ceil(total/limit)},timezone:'Asia/Kolkata'};
}
module.exports={profile,identity,summaries,courses,course,sessionView,history};
