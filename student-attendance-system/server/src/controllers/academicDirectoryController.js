const { ClassGroup, Course, CourseOffering, AcademicTerm } = require('../models/Academic');
const Teacher = require('../models/Teacher'), Student = require('../models/Student'), Account = require('../models/Account');
const A = require('../services/academicService'), D = require('../services/administrationService'), S = require('../services/academicDirectoryService');
const ok=(res,data,status=200)=>res.status(status).json({success:true,...data});
exports.classes=D.wrap(async(req,res)=>{const docs=await ClassGroup.find().sort({label:1});ok(res,{classes:docs.map(S.classView),count:docs.length});});
exports.createClass=D.wrap(async(req,res)=>{
 const name=A.text(req.body.name,'Class name'),code=A.text(req.body.code,'Class code');
 const doc=await ClassGroup.create({label:name,code,section:req.body.section||'',department:req.body.department||'',program:req.body.program||'',year:req.body.year||'',semester:req.body.semester||'',academicSession:req.body.academicSession||''});
 await D.audit(req,'CREATE_CLASS','ClassGroup',doc.id,{name,code});ok(res,{class:S.classView(doc)},201);
});
exports.updateClass=D.wrap(async(req,res)=>{
 const doc=await ClassGroup.findById(A.id(req.params.id));if(!doc)A.fail(404,'Class not found.');
 if(req.method==='DELETE')doc.state='archived';
 else {if(req.body.name!==undefined)doc.label=A.text(req.body.name,'Class name');for(const key of ['code','department','program','year','semester','academicSession'])if(req.body[key]!==undefined)doc[key]=req.body[key];if(req.body.status!==undefined){if(!['active','archived'].includes(req.body.status))A.fail(400,'Invalid status.');doc.state=req.body.status;}}
 await doc.save();await D.audit(req,'UPDATE_CLASS','ClassGroup',doc.id,req.body);ok(res,{class:S.classView(doc)});
});
exports.subjects=D.wrap(async(req,res)=>{const docs=await S.offerings(req.query.classId?{classGroupId:A.id(req.query.classId)}:{});ok(res,{subjects:docs.map(S.subjectView),count:docs.length});});
exports.createSubject=D.wrap(async(req,res)=>{
 const name=A.text(req.body.name,'Subject name'),code=A.text(req.body.code,'Subject code').toUpperCase(),classId=A.id(req.body.classId);
 if(!await ClassGroup.exists({_id:classId,state:'active'}))A.fail(400,'Choose an active class.');
 const threshold=Number(req.body.attendanceThreshold??75);if(!Number.isFinite(threshold)||threshold<0||threshold>100)A.fail(400,'Minimum must be between 0 and 100.');
 const term=await S.term(req.body.academicSession,threshold);
 let course=await Course.findOne({code});if(!course)course=await Course.create({name,code});else if(course.name!==name)A.fail(409,'This course code already has a different name. Choose the existing name or a new code.');
 const doc=await CourseOffering.create({courseId:course._id,termId:term._id,classGroupId:classId,credits:Number(req.body.credits)||0});
 await D.audit(req,'CREATE_SUBJECT','CourseOffering',doc.id,{name,code,classId});ok(res,{subject:S.subjectView(await A.populated(CourseOffering.findById(doc._id)))},201);
});
exports.updateSubject=D.wrap(async(req,res)=>{
 const doc=await A.offering(req.params.id);
 if(req.body.name!==undefined)await Course.findByIdAndUpdate(doc.courseId,{name:A.text(req.body.name,'Subject name')},{runValidators:true});
 if(req.body.status!==undefined){if(!['active','archived'].includes(req.body.status))A.fail(400,'Invalid status.');doc.state=req.body.status;}
 if(req.body.credits!==undefined){const credits=Number(req.body.credits);if(!Number.isFinite(credits)||credits<0)A.fail(400,'Credits must be a nonnegative number.');doc.credits=credits;}
 await doc.save();
 if(req.body.attendanceThreshold!==undefined)await require('../services/attendanceAnalyticsService').setSetting(req, String(doc.termId), { minimumAttendancePercent: Number(req.body.attendanceThreshold) });
 await D.audit(req,'UPDATE_SUBJECT','CourseOffering',doc.id,req.body);ok(res,{subject:S.subjectView(await A.populated(CourseOffering.findById(doc._id)))});
});
function entry(doc,row,kind,account){const v=kind==='assignments';return {id:String(row._id),_id:row._id,offeringId:String(doc._id),classId:String(doc.classGroupId._id),subjectId:String(doc._id),class:S.classView(doc.classGroupId),subject:S.subjectView(doc),academicSession:doc.termId.name,status:row.state==='active'?'active':v?'inactive':'dropped',startDate:row.startDate,endDate:row.endDate,...(v?{teacherId:account?String(account._id):String(row.teacherId?._id),teacherUser:account?{id:String(account._id),name:account.name,email:account.email}:null,teacherProfile:row.teacherId,teacher:row.teacherId}:{studentId:String(row.studentId?._id||row.studentId),student:row.studentId?{...D.plain(row.studentId)}:null})};}
exports.entries=D.wrap(async(req,res)=>{
 const kind=req.params.kind,field=kind==='assignments'?'assignments':'enrolments';
 const filter={};if(req.query.classId)filter.classGroupId=A.id(req.query.classId);if(req.query.subjectId)filter._id=A.id(req.query.subjectId);
 const docs=await S.offerings(filter);const accounts=kind==='assignments'?await Account.find({role:'teacher'}).lean():[];
 let items=docs.flatMap(doc=>doc[field].map(row=>entry(doc,row,kind,accounts.find(a=>String(a.teacherProfileId)===String(row.teacherId?._id)))));
 if(req.query.studentId)items=items.filter(i=>i.studentId===req.query.studentId);ok(res,{[kind]:items,count:items.length});
});
exports.addEntry=D.wrap(async(req,res)=>{
 const kind=req.params.kind,teacher=kind==='assignments',field=teacher?'assignments':'enrolments';
 const source=await S.subject(req.body.subjectId,req.body.classId,req.body.academicSession);
 let profileId;
 if(teacher){const key=A.id(req.body.teacherId),account=await Account.findOne({$or:[{_id:key},{teacherProfileId:key}],role:'teacher',isActive:true});if(!account?.teacherProfileId)A.fail(400,'Choose an active Teacher account.');profileId=account.teacherProfileId;}
 else{profileId=A.id(req.body.studentId);if(!await Student.exists({_id:profileId,status:{$nin:['archived','inactive']}}))A.fail(400,'Choose an active Student.');}
 const key=teacher?'teacherId':'studentId';
 const startDate=req.body.startDate||source.termId.startDate,endDate=req.body.endDate||source.termId.endDate;A.range(startDate,endDate);
 if(startDate<source.termId.startDate||endDate>source.termId.endDate)A.fail(400,'Effective dates must fall within the academic session.');
 const doc=await A.changeOffering(source.id,async current=>{if(current[field].some(e=>String(e[key])===String(profileId)&&e.startDate<=endDate&&e.endDate>=startDate))A.fail(409,'An effective enrollment or assignment already covers these dates.');return {[field]:[...current[field].map(e=>e.toObject()),{[key]:profileId,startDate,endDate,state:'active'}]};});
 await D.audit(req,teacher?'CREATE_ASSIGNMENT':'CREATE_ENROLLMENT','CourseOffering',doc.id,{profileId:String(profileId),startDate,endDate});ok(res,{message:teacher?'Teacher assigned':'Student enrolled'},201);
});
exports.removeEntry=D.wrap(async(req,res)=>{
 const field=req.params.kind==='assignments'?'assignments':'enrolments',key=A.id(req.params.id);
 const doc=await CourseOffering.findOne({[field+'._id']:key});if(!doc)A.fail(404,'Enrollment or assignment not found.');
 const today=A.campusDate(new Date()),yesterday=A.campusDate(new Date(Date.now()-86400000));
 await A.changeOffering(doc.id,async current=>({[field]:current[field].filter(e=>String(e._id)!==key||e.startDate<=yesterday).map(e=>{const value=e.toObject();if(String(e._id)===key){value.state='withdrawn';value.endDate=value.endDate<yesterday?value.endDate:yesterday;}return value;})}));
 await D.audit(req,'WITHDRAW_'+req.params.kind.toUpperCase(),'CourseOffering',doc.id,{entryId:key,effectiveDate:today});ok(res,{message:'Access withdrawn; historical records preserved.'});
});
exports.myAssignments=D.wrap(async(req,res)=>{const docs=await S.offerings({state:'active','assignments.teacherId':req.teacherId});const assignments=docs.flatMap(doc=>doc.assignments.filter(a=>String(a.teacherId?._id)===String(req.teacherId)&&a.state==='active').map(a=>entry(doc,a,'assignments',req.account)));ok(res,{assignments});});
exports.roster=D.wrap(async(req,res)=>{const doc=await S.subject(req.query.subjectId,req.query.classId,req.query.academicSession),today=A.campusDate(new Date());if(req.userRole==='teacher'&&!A.assigned(doc,req.teacherId,today))A.fail(403,'You are not assigned to this class and subject.');const rows=await A.roster(doc,today);ok(res,{roster:rows.map(r=>({_id:r.studentId,id:String(r.studentId),name:r.name,studentId:r.rollNo})),count:rows.length});});
