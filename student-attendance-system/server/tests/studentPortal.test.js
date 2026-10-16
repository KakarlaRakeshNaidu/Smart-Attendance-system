const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const {seed,cleanup,password}=require('./fixtures');const {academicDemo}=require('./restorationFixtures');
const Account=require('../src/models/Account'),Student=require('../src/models/Student');const {Course,CourseOffering,LectureSession}=require('../src/models/Academic');const Attendance=require('../src/models/Attendance');const A=require('../src/services/academicService');
test('Expanded Student portal: own records, bounded history, frozen eligibility and safe photo replacement',async t=>{
const fx=await seed();let server;const files=[];
try{
 const demo=await academicDemo(fx);const other=new Account({name:fx.otherStudent.name,email:'other-login@college.example.test',role:'student',isActive:true,studentProfileId:fx.otherStudent.id});await other.setPassword(password);await other.save();
 await Student.updateOne({_id:fx.student.id},{$set:{faceEmbedding:[1,0.25,0.5]}});
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api',tokens={};
 async function req(route,role='student',method='GET',body){const form=body instanceof FormData;const response=await fetch(base+route,{method,headers:{...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{}),...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{})});const data=await response.json();return{status:response.status,data};}
 const ok=(r,status=200)=>{assert.equal(r.status,status,r.data.message);return r.data;};
 async function login(role,email,pass=password){const r=await req('/auth/login',null,'POST',{email,password:pass});if(r.status===200)tokens[role]=r.data.token;return r;}
 for(const role of ['student','teacher','admin'])ok(await login(role,fx.users[role].email));ok(await login('other',other.email));
 await t.test('populated and empty overview derive identity from the linked profile',async()=>{
  const data=ok(await req('/student-portal/overview?studentId='+fx.otherStudent.id));assert.equal(data.student.studentId,fx.student.studentId);assert.equal(data.courses.length,1);assert.equal(data.courses[0].summary.percentage,null);assert.ok(!JSON.stringify(data).includes(fx.otherStudent.name));
  const empty=new Account({name:'Isolated empty Student',email:'empty@college.example.test',role:'student',isActive:true});await empty.setPassword(password);await empty.save();ok(await login('missing',empty.email));ok(await req('/student-portal/profile','missing'),403);
  const profile=await Student.create({studentId:'EMPTY-PORTAL',name:'Isolated empty profile',email:empty.email});await Account.updateOne({_id:empty.id},{$set:{studentProfileId:profile.id}});const noData=ok(await req('/student-portal/overview','missing'));assert.deepEqual(noData.courses,[]);assert.deepEqual(noData.recent,[]);
 });
 const roster=[fx.student,fx.otherStudent].map(s=>({studentId:s.id,name:s.name,rollNo:s.studentId}));
 await LectureSession.updateOne({_id:demo.first.id},{$set:{attendanceStarted:true,roster,records:[{studentId:fx.student.id,status:'present',method:'manual',markedAt:demo.first.scheduledStart},{studentId:fx.otherStudent.id,status:'absent',method:'finalisation',markedAt:demo.first.scheduledStart}],state:'completed',finalised:true}});
 await LectureSession.updateOne({_id:demo.second.id},{$set:{attendanceStarted:true,roster,records:[{studentId:fx.student.id,status:'late',method:'manual',markedAt:demo.second.scheduledStart}],state:'completed',finalised:true}});
 async function lecture(hour,options={}){const start=demo.day+'T'+hour+':00:00+05:30',end=demo.day+'T'+hour+':30:00+05:30';return LectureSession.create({offeringId:demo.offering.id,teacherId:fx.teacher.id,...A.times({scheduledStart:start,scheduledEnd:end}),state:options.state||'scheduled',finalised:options.finalised||false,attendanceStarted:options.started||false,roster:options.started?roster:[],records:options.status?[{studentId:fx.student.id,status:options.status,method:'manual',markedAt:start}]:[],createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id});}
 await lecture('09',{state:'completed',finalised:true,started:true,status:'absent'});await lecture('10',{state:'cancelled',started:true,status:'present'});await lecture('11',{started:true,status:'present'});await lecture('12');
 await Attendance.updateOne({_id:demo.legacy.id},{$push:{records:{studentId:fx.otherStudent.id,studentName:fx.otherStudent.name,studentRollNo:fx.otherStudent.studentId,status:'absent'}}});
 const hiddenCourse=await Course.create({code:'PRIVATE-PORTAL',name:'Isolated other Student course'});const hidden=await CourseOffering.create({courseId:hiddenCourse.id,termId:demo.offering.termId,classGroupId:demo.offering.classGroupId,enrolments:[{studentId:fx.otherStudent.id,startDate:'2020-01-01',endDate:'2035-12-31'}]});
 await t.test('course and session details never expose classmates, Teacher email or arbitrary profile data',async()=>{
  for(const route of ['/student-portal/courses','/student-portal/courses/'+demo.offering.id,'/academic/offerings','/academic/offerings/'+demo.offering.id,'/academic/sessions/'+demo.first.id,'/academic/sessions','/student-portal/profile','/students/me']){
   const data=ok(await req(route));const json=JSON.stringify(data);assert.ok(!json.includes(fx.otherStudent.name),route);assert.ok(!json.includes(fx.otherStudent.email||'other@college.example.test'),route);assert.ok(!json.includes(fx.teacher.email),route);assert.ok(!json.includes('faceEmbedding'),route);assert.ok(!json.includes('passwordHash'),route);
  }
  const s=ok(await req('/academic/sessions/'+demo.first.id)).item;assert.equal(s.records.length,1);assert.equal(s.roster.length,1);assert.equal(s.canMark,false);
  ok(await req('/student-portal/courses/'+hidden.id),403);ok(await req('/student-portal/attendance?offeringId='+hidden.id),403);
  const privateSession=await LectureSession.create({offeringId:hidden.id,teacherId:fx.teacher.id,...A.times({scheduledStart:demo.day+'T15:00:00+05:30',scheduledEnd:demo.day+'T15:30:00+05:30'}),createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id});ok(await req('/academic/sessions/'+privateSession.id),403);
 });
 await t.test('one backend formula counts present/late and excludes cancelled, scheduled and unfinalised sessions',async()=>{
  const a=ok(await req('/academic/my-summary')).items.find(s=>s.offeringId===demo.offering.id);assert.deepEqual([a.present,a.total,a.percentage],[2,3,67]);const b=ok(await req('/student-portal/courses')).items.find(s=>s.offeringId===demo.offering.id);assert.equal(b.summary.percentage,67);
  const noLectures=await Course.create({code:'EMPTY-SUMMARY',name:'Isolated no completed lectures'});await CourseOffering.create({courseId:noLectures.id,termId:demo.offering.termId,classGroupId:demo.offering.classGroupId,enrolments:[{studentId:fx.student.id,startDate:'2020-01-01',endDate:'2035-12-31'}]});assert.equal(ok(await req('/academic/my-summary')).items.find(s=>s.course.code==='EMPTY-SUMMARY').percentage,null);
 });
 await t.test('filters, inclusive India dates, stable pagination and labelled legacy history work',async()=>{
  const first=ok(await req('/student-portal/attendance?limit=2'));const second=ok(await req('/student-portal/attendance?limit=2&page=2'));assert.equal(first.items.length,2);assert.equal(second.items.length,2);assert.ok(first.items.every(s=>!second.items.some(r=>s.id===r.id)));
  const all=ok(await req('/student-portal/attendance?from='+demo.day+'&to='+demo.day+'&limit=100'));assert.equal(all.pagination.total,7);assert.equal(all.items.filter(r=>r.recordType==='Legacy attendance').length,1);assert.ok(!JSON.stringify(all).includes(fx.otherStudent.name));
  const sameDay=all.items.filter(s=>[demo.first.id,demo.second.id].includes(s.id));assert.equal(sameDay.length,2);assert.notEqual(sameDay[0].date,sameDay[1].date);
  assert.equal(ok(await req('/student-portal/attendance?status=late')).pagination.total,2);assert.equal(ok(await req('/student-portal/attendance?status=cancelled')).pagination.total,1);assert.equal(ok(await req('/student-portal/attendance?status=not-marked')).pagination.total,1);
  const scoped=ok(await req('/student-portal/attendance?offeringId='+demo.offering.id+'&termId='+demo.offering.termId));assert.ok(scoped.items.every(s=>s.recordType==='Session attendance'));assert.equal(scoped.pagination.total,6);
  for(const query of ['page=0','limit=101','status=invalid','from=2026-02-30','from=2026-12-01&to=2026-01-01','termId=invalid','from[]=2026-01-01'])ok(await req('/student-portal/attendance?'+query),400);
  const own=ok(await req('/student-portal/attendance?studentId='+fx.otherStudent.id));assert.equal(own.pagination.total,7);
 });
 await t.test('saved eligibility survives withdrawal while uncaptured sessions respect enrolment boundaries',async()=>{
  await CourseOffering.updateOne({_id:demo.offering.id,'enrolments.studentId':fx.student.id},{$set:{'enrolments.$.startDate':demo.day,'enrolments.$.endDate':demo.day,'enrolments.$.state':'withdrawn'}});
  const next=new Date(demo.day+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);const day=next.toISOString().slice(0,10);const outside=await LectureSession.create({offeringId:demo.offering.id,teacherId:fx.teacher.id,...A.times({scheduledStart:day+'T09:00:00+05:30',scheduledEnd:day+'T09:30:00+05:30'}),createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id});
  const previous=new Date(demo.day+'T00:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);const beforeDay=previous.toISOString().slice(0,10);const before=await LectureSession.create({offeringId:demo.offering.id,teacherId:fx.teacher.id,...A.times({scheduledStart:beforeDay+'T09:00:00+05:30',scheduledEnd:beforeDay+'T09:30:00+05:30'}),createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id});ok(await req('/academic/sessions/'+before.id),403);
  ok(await req('/academic/sessions/'+outside.id),403);assert.equal(ok(await req('/student-portal/attendance?offeringId='+demo.offering.id)).pagination.total,6);
  await CourseOffering.updateOne({_id:demo.offering.id},{$pull:{enrolments:{studentId:fx.student.id}}});assert.equal(ok(await req('/student-portal/courses/'+demo.offering.id)).item.enrolmentStatus,'historical');assert.equal(ok(await req('/academic/my-summary')).items.find(s=>s.offeringId===demo.offering.id).percentage,67);
 });
 await t.test('explicitly mapped legacy records remain accessible without duplicate history entries',async()=>{
  const before=ok(await req('/student-portal/attendance')).pagination.total;
  await LectureSession.create({offeringId:demo.offering.id,teacherId:fx.teacher.id,scheduledStart:demo.legacy.date,scheduledEnd:new Date(demo.legacy.date.getTime()+60000),campusDate:A.campusDate(demo.legacy.date),attendanceStarted:true,roster,records:[{studentId:fx.student.id,status:'late',method:'legacy',markedAt:demo.legacy.date}],legacyAttendanceId:demo.legacy.id,createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id});
  const data=ok(await req('/student-portal/attendance'));assert.equal(data.pagination.total,before);assert.ok(data.items.every(r=>r.recordType!=='Legacy attendance'));const legacy=ok(await req('/academic/legacy'));assert.equal(legacy.items[0].mapped,true);assert.equal(legacy.items[0].records.length,1);
 });
 await t.test('Student cannot edit identities, face data, staff records or attendance through direct API calls',async()=>{
  for(const [route,method,body] of [['/students/'+fx.otherStudent.id,'GET'],['/students','GET'],['/students','POST',{name:'Intrusion',studentId:'INTRUSION'}],['/students/'+fx.student.id,'PUT',{role:'admin',studentId:'ALTERED'}],['/students/'+fx.student.id+'/register-face','POST',{faceImage:'fake'}],['/academic/sessions/'+demo.first.id+'/attendance','POST',{records:[]}],['/academic/sessions/'+demo.first.id+'/finalise','POST',{}],['/academic/sessions/'+demo.first.id+'/attendance','DELETE'],['/admin/accounts','GET'],['/academic/offerings','POST',{}]])ok(await req(route,'student',method,body),403);
  ok(await req('/student-portal/profile','student','PUT',{role:'admin',email:'altered@example.test'}),404);
 });
 await t.test('own photo upload validates files and identity fields without replacing the stored face embedding',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6m0AAAAASUVORK5CYII=','base64');
  const form=new FormData();form.append('profilePhoto',new Blob([png],{type:'image/png'}),'avatar.png');const data=ok(await req('/student-portal/profile/photo','student','PUT',form));assert.ok(data.student.profilePhoto.startsWith('/uploads/students/'+fx.student.id+'/'));files.push(path.join(__dirname,'..',data.student.profilePhoto));
  assert.deepEqual((await Student.findById(fx.student.id)).faceEmbedding,[1,0.25,0.5]);
  const tampered=new FormData();tampered.append('studentId',fx.otherStudent.id);tampered.append('role','admin');tampered.append('profilePhoto',new Blob([png],{type:'image/png'}),'avatar.png');ok(await req('/student-portal/profile/photo','student','PUT',tampered),400);
  const fake=new FormData();fake.append('profilePhoto',new Blob(['<script>fake image</script>'],{type:'image/png'}),'fake.png');ok(await req('/student-portal/profile/photo','student','PUT',fake),400);
  assert.equal((await Student.findById(fx.student.id)).studentId,fx.student.studentId);
 });
 await t.test('shared-account password changes and expired/inactive sessions remain enforced',async()=>{
  ok(await req('/auth/change-password','student','PUT',{currentPassword:password,newPassword:'IsolatedPortalOnly!27'}));ok(await login('student',fx.student.email,password),401);ok(await login('student',fx.student.email,'IsolatedPortalOnly!27'));
  await Account.updateOne({_id:fx.users.student.id},{$set:{isActive:false}});ok(await req('/student-portal/overview'),401);await Account.updateOne({_id:fx.users.student.id},{$set:{isActive:true}});
  tokens.expired=require('jsonwebtoken').sign({id:fx.users.student.id},process.env.JWT_SECRET,{expiresIn:-1});ok(await req('/student-portal/overview','expired'),401);
  for(const role of ['teacher','admin'])ok(await req('/student-portal/overview',role),403);
 });
}finally{
 if(server)await new Promise(r=>server.close(r));for(const file of files){const root=path.resolve(__dirname,'../uploads/students',fx.student.id);const folder=path.dirname(path.resolve(file));if(folder===root)await fs.promises.rm(root,{recursive:true,force:true});}await cleanup();
}
});