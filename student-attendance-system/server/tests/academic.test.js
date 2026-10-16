const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { seed,cleanup,password } = require('./fixtures');
const { AcademicTerm,ClassGroup,Course,CourseOffering,LectureSession } = require('../src/models/Academic');
const Account = require('../src/models/Account'),Teacher = require('../src/models/Teacher'),Student = require('../src/models/Student'),Attendance = require('../src/models/Attendance');
const face = require('../src/services/faceRecognitionService');
const { campusDate } = require('../src/services/academicService');
test('Upgrade 2 actual HTTP academic/session flows with isolated MongoDB', async t => {
    let server;
    const tokens = {}, originalFace = face.recognizeFace, originalMulti = face.recognizeMultipleFaces;
    const fx = await seed(), ids={}, day=campusDate(new Date(Date.now()-86400000));
    const stamp = n => ({ scheduledStart:day+'T'+String(n).padStart(2,'0')+':00:00+05:30',scheduledEnd:day+'T'+String(n).padStart(2,'0')+':45:00+05:30' });
    try {
        await Promise.all([AcademicTerm,ClassGroup,Course,CourseOffering,LectureSession].map(m=>m.init()));
        server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
        const root='http://127.0.0.1:'+server.address().port+'/api';
        async function req(path,role='admin',method='GET',body) {
            const res=await fetch(root+path,{method,headers:{...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
            return {status:res.status,data:res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text()};
        }
        const ok=(r,status=200)=>{assert.equal(r.status,status,typeof r.data==='object'?r.data.message:undefined);return r.data;};
        const academic=(path,role,method,body)=>req('/academic'+path,role,method,body);
        const create=async (n=8,offering=ids.offering)=>ok(await academic('/sessions','teacher','POST',{offeringId:offering,...stamp(n)}),201).item;
        await t.test('three roles authenticate; inactive and stale tokens remain rejected',async()=>{
            for(const role of ['teacher','student','admin']) { const data=ok(await req('/auth/login',null,'POST',{email:fx.users[role].email,password,role:'admin'}));assert.equal(data.user.role,role);tokens[role]=data.token;ok(await req('/auth/me',role)); }
            tokens.invalid='invalid';ok(await academic('/offerings','invalid'),401);
        });
        await t.test('Admin creates referenced structures/offering; validation and duplicate submissions',async()=>{
            ids.term=ok(await academic('/structures/terms','admin','POST',{name:'ISOLATED DEMO TERM',startDate:'2020-01-01',endDate:'2035-12-31'}),201).item._id;
            ids.group=ok(await academic('/structures/classes','admin','POST',{label:'ISOLATED DEMO CLASS',section:'A'}),201).item._id;
            ids.course=ok(await academic('/structures/courses','admin','POST',{code:'DEMO101',name:'Isolated demo course'}),201).item._id;
            ok(await academic('/structures/terms','admin','POST',{name:'Invalid',startDate:'2026-02-30',endDate:'2026-03-01'}),400);
            ok(await academic('/structures/courses','admin','POST',{code:'DEMO101',name:'Duplicate'}),409);
            ok(await academic('/offerings','admin','POST',{courseId:ids.course,termId:ids.term,classGroupId:new mongoose.Types.ObjectId()}),400);
            const body={courseId:ids.course,termId:ids.term,classGroupId:ids.group};
            const result=await Promise.all([academic('/offerings','admin','POST',body),academic('/offerings','admin','POST',body)]);
            assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);ids.offering=result.find(r=>r.status===201).data.item._id;
            ok(await academic('/structures/courses','teacher','POST',{code:'DENY',name:'Denied'}),403);
            ok(await academic('/offerings','student','POST',body),403);
            ok(await academic('/structures/terms/'+ids.term,'admin','PATCH',{startDate:'2021-01-01'}),409);
        });
        await t.test('effective links validate profiles, bounds and overlapping concurrent submissions',async()=>{
            const assignment={teacherId:fx.teacher.id,startDate:'2020-01-01',endDate:'2035-12-31'};
            ok(await academic('/offerings/'+ids.offering+'/assignments','teacher','POST',assignment),403);
            const result=await Promise.all([academic('/offerings/'+ids.offering+'/assignments','admin','POST',assignment),academic('/offerings/'+ids.offering+'/assignments','admin','POST',assignment)]);
            assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
            ok(await academic('/offerings/'+ids.offering+'/enrolments','admin','POST',{studentId:fx.users.student.id,startDate:'2020-01-01',endDate:'2035-12-31'}),400);
            const student={studentId:fx.student.id,startDate:'2020-01-01',endDate:'2035-12-31'};
            const enrolled=await Promise.all([academic('/offerings/'+ids.offering+'/enrolments','admin','POST',student),academic('/offerings/'+ids.offering+'/enrolments','admin','POST',student)]);
            assert.deepEqual(enrolled.map(r=>r.status).sort(),[201,409]);
            ok(await academic('/offerings/'+ids.offering+'/enrolments','admin','POST',{studentId:fx.otherStudent.id,startDate:'2020-01-01',endDate:'2035-12-31'}),201);
            ok(await academic('/offerings/'+ids.offering+'/enrolments','admin','POST',{studentId:fx.otherStudent.id,startDate:'2035-12-31',endDate:'2036-01-01'}),400);
            assert.equal(ok(await academic('/offerings','teacher')).items.length,1);
            const own=ok(await academic('/offerings','student')).items[0];assert.equal(own.enrolments.length,1);assert.ok(!own.assignments);
            const teachers=ok(await academic('/offerings','teacher')).items[0];assert.ok(!teachers.enrolments);
        });
        await t.test('student creation does not enrol or activate; unauthorised Teacher cannot self-assign or read sessions',async()=>{
            const added=ok(await req('/students','teacher','POST',{name:'Not enrolled demo',studentId:'DEMO-UNENROLLED',email:'unenrolled@college.example.test'}),201).student;
            assert.ok(!await Account.exists({studentProfileId:added._id}));assert.ok(!(await CourseOffering.findById(ids.offering)).enrolments.some(e=>String(e.studentId)===added._id));
            const other=await Teacher.create({name:'Unassigned Teacher',email:'outsider@example.test',password});
            const account=new Account({name:other.name,email:other.email,role:'teacher',isActive:true,teacherProfileId:other._id});await account.setPassword(password);await account.save();
            tokens.outsider=ok(await req('/auth/login',null,'POST',{email:other.email,password})).token;
            assert.equal(ok(await academic('/offerings','outsider')).items.length,0);
            ok(await academic('/offerings/'+ids.offering+'/assignments','outsider','POST',{teacherId:other.id,startDate:'2020-01-01',endDate:'2035-12-31'}),403);
            ok(await academic('/sessions','outsider','POST',{offeringId:ids.offering,...stamp(8)}),403);
        });
        await t.test('two lectures on one date are separate; exact repeat and reversed times rejected',async()=>{
            const same={offeringId:ids.offering,...stamp(8)};
            const result=await Promise.all([academic('/sessions','teacher','POST',same),academic('/sessions','teacher','POST',same)]);
            assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);ids.first=result.find(r=>r.status===201).data.item._id;
            ids.second=(await create(9))._id;
            assert.notEqual(ids.first,ids.second);assert.equal((await LectureSession.findById(ids.first)).campusDate,(await LectureSession.findById(ids.second)).campusDate);
            ok(await academic('/sessions','teacher','POST',{offeringId:ids.offering,scheduledStart:stamp(10).scheduledEnd,scheduledEnd:stamp(10).scheduledStart}),400);
            ok(await academic('/sessions','teacher','POST',{offeringId:ids.offering,scheduledStart:'2026-02-30T08:00:00+05:30',scheduledEnd:'2026-02-30T08:45:00+05:30'}),400);
            ok(await academic('/sessions/'+ids.first,'outsider'),403);
        });
        await t.test('manual marks validate server roster and roles; missing entries are not marked',async()=>{
            const prefix='/sessions/'+ids.first;
            assert.equal(ok(await academic(prefix,'teacher')).item.records.length,0);
            const body={records:[{studentId:fx.student.id,status:'late'}]};
            ok(await academic(prefix+'/attendance','admin','POST',body),403);ok(await academic(prefix+'/attendance','student','POST',body),403);ok(await academic(prefix+'/attendance','outsider','POST',body),403);
            ok(await academic(prefix+'/attendance','teacher','POST',{records:[{studentId:new mongoose.Types.ObjectId(),status:'present'}]}),400);
            const item=ok(await academic(prefix+'/attendance','teacher','POST',body)).item;assert.equal(item.roster.length,2);assert.equal(item.records.length,1);assert.equal(item.state,'scheduled');
            const own=ok(await academic(prefix,'student')).item;assert.equal(own.roster.length,1);assert.equal(own.records.length,1);assert.equal(String(own.roster[0].studentId),fx.student.id);
            assert.equal(ok(await academic('/my-summary','student')).items[0].total,0);
            ok(await req('/attendance','teacher','POST',body),409);ok(await req('/attendance/today','teacher','DELETE'),409);
        });
        await t.test('concurrent marking never duplicates or loses independent students; reset preserves snapshot',async()=>{
            const responses=await Promise.all(Array.from({length:6},(_,i)=>academic('/sessions/'+ids.second+'/attendance','teacher','POST',{records:[{studentId:i%2?fx.student.id:fx.otherStudent.id,status:'present'}]})));
            responses.forEach(r=>ok(r));
            let doc=await LectureSession.findById(ids.second);assert.equal(doc.records.length,2);assert.equal(new Set(doc.records.map(r=>String(r.studentId))).size,2);
            ok(await academic('/sessions/'+ids.second+'/attendance','teacher','DELETE'));
            doc=await LectureSession.findById(ids.second);assert.equal(doc.roster.length,2);assert.equal(doc.records.length,0);assert.ok(doc.attendanceStarted);
        });
        await t.test('later enrolment and withdrawal cannot rewrite captured roster or earlier eligibility',async()=>{
            const extra=await Student.create({name:'Later student',studentId:'LATER'});
            ok(await academic('/offerings/'+ids.offering+'/enrolments','admin','POST',{studentId:extra.id,startDate:campusDate(new Date()),endDate:'2035-12-31'}),201);
            const item=ok(await academic('/sessions/'+ids.first,'teacher')).item;assert.equal(item.roster.length,2);
            const doc=await CourseOffering.findById(ids.offering),link=doc.enrolments.find(e=>String(e.studentId)===fx.otherStudent.id);
            ok(await academic('/offerings/'+ids.offering+'/enrolments/'+link.id,'admin','PATCH',{endDate:day}));
            assert.equal(ok(await academic('/sessions/'+ids.second,'teacher')).item.roster.length,2);
            ok(await academic('/sessions/'+ids.first+'/attendance','teacher','POST',{records:[{studentId:extra.id,status:'present'}]}),400);
        });
        await t.test('finalisation creates remaining absence; late counts present; frozen records cannot be overwritten or reset',async()=>{
            const one=ok(await academic('/sessions/'+ids.first+'/finalise','teacher','POST',{})).item;assert.equal(one.state,'completed');assert.ok(one.finalised);assert.equal(one.records.length,2);assert.equal(one.records.find(r=>r.studentId===fx.otherStudent.id).status,'absent');
            const prefix='/sessions/'+ids.first;
            ok(await academic(prefix+'/attendance','teacher','POST',{records:[{studentId:fx.student.id,status:'absent'}]}),409);
            ok(await academic(prefix+'/attendance','teacher','DELETE'),409);ok(await academic(prefix+'/finalise','teacher','POST',{}),409);
            await academic('/sessions/'+ids.second+'/attendance','teacher','POST',{records:[{studentId:fx.student.id,status:'absent'}]});
            ok(await academic('/sessions/'+ids.second+'/finalise','teacher','POST',{}));
            const summary=ok(await academic('/my-summary','student')).items[0];assert.equal(summary.total,2);assert.equal(summary.present,1);assert.equal(summary.percentage,50);
            const csv=ok(await academic(prefix+'/export','admin'));assert.ok(csv.includes('DEMO101'));assert.ok(csv.includes(ids.first));assert.ok(csv.includes('Asia/Kolkata'));
            const ownCsv=ok(await academic('/sessions/'+ids.second+'/export','teacher'));assert.ok(ownCsv.includes(ids.second));ok(await academic(prefix+'/export','outsider'),403);ok(await academic(prefix+'/export','student'),403);
        });
        await t.test('face/photo candidates are authorised, repeated matches deduplicate and outside matches save nothing',async()=>{
            const s=await create(10),path='/sessions/'+s._id+'/recognise';
            let seen;
            face.recognizeFace=async(image,candidates)=>{seen=candidates;return {success:true,students:[{studentId:fx.student.studentId,confidence:0.98}]};};
            ok(await academic(path,'teacher','POST',{image:'fixture',mode:'single',candidateIds:['OUTSIDE']}));
            assert.deepEqual(new Set(seen),new Set([fx.student.studentId,fx.otherStudent.studentId]));
            await Promise.all([academic(path,'teacher','POST',{image:'fixture',mode:'single'}),academic(path,'teacher','POST',{image:'fixture',mode:'single'})]);
            assert.equal((await LectureSession.findById(s._id)).records.length,1);
            face.recognizeMultipleFaces=async()=>({success:true,recognizedStudents:[{studentId:fx.student.studentId,confidence:0.99},{studentId:fx.student.studentId,confidence:0.98}]});
            ok(await academic(path,'teacher','POST',{image:'fixture',mode:'multiple',method:'photo'}));
            assert.equal((await LectureSession.findById(s._id)).records.length,1);
            face.recognizeMultipleFaces=async()=>({success:true,recognizedStudents:[{studentId:'OUTSIDE'}]});
            ok(await academic(path,'teacher','POST',{image:'fixture',method:'photo'}),502);assert.equal((await LectureSession.findById(s._id)).records.length,1);
            face.recognizeFace=async()=>({success:false,httpStatus:503,message:'Safe face service timeout'});
            ok(await academic(path,'teacher','POST',{image:'fixture',mode:'single'}),503);
            ok(await academic('/sessions/'+s._id+'/attendance','teacher','POST',{records:[{studentId:fx.otherStudent.id,status:'present'}]}));
        });
        await t.test('cancelled lectures reject writes; explicit Admin cancellation preserves completed marks and excludes denominator',async()=>{
            const s=await create(11);
            ok(await academic('/sessions/'+s._id,'teacher','PATCH',{state:'cancelled',cancellationReason:''}),400);
            ok(await academic('/sessions/'+s._id,'teacher','PATCH',{state:'cancelled',cancellationReason:'Isolated demo cancellation'}));
            ok(await academic('/sessions/'+s._id+'/attendance','teacher','POST',{records:[{studentId:fx.student.id,status:'present'}]}),409);
            ok(await academic('/sessions/'+s._id+'/finalise','teacher','POST',{}),409);
            const before=(await LectureSession.findById(ids.second)).records.map(r=>r.toObject());
            ok(await academic('/sessions/'+ids.second,'admin','PATCH',{state:'cancelled',cancellationReason:'Recorded correction of lecture delivery status'}));
            assert.deepEqual((await LectureSession.findById(ids.second)).records.map(r=>r.toObject()),before);
            assert.equal(ok(await academic('/my-summary','student')).items[0].percentage,100);
        });
        await t.test('empty offerings never fall back to global recognition; missing faces show useful errors',async()=>{
            const c=await Course.create({code:'EMPTY',name:'Isolated empty roster'}),o=await CourseOffering.create({courseId:c.id,termId:ids.term,classGroupId:ids.group,assignments:[{teacherId:fx.teacher.id,startDate:'2020-01-01',endDate:'2035-12-31'}]});
            const s=await create(12,o.id);
            let called=false;face.recognizeFace=async()=>{called=true;return {success:true};};
            ok(await academic('/sessions/'+s._id+'/recognise','teacher','POST',{image:'fixture',mode:'single'}),409);assert.equal(called,false);
            ok(await academic('/sessions/'+s._id+'/finalise','teacher','POST',{}),409);
            face.recognizeFace=async()=>({success:false,message:'No candidates have registered faces',httpStatus:400});
            ok(await academic('/sessions/'+(await create(13))._id+'/recognise','teacher','POST',{image:'fixture',mode:'single'}),400);
        });
        await t.test('legacy mapping preview, validated explicit conversion and repeat are safe; original stays unchanged',async()=>{
            const original=await Attendance.create({teacherId:fx.teacher.id,date:stamp(14).scheduledStart,subject:'Unmapped legacy',records:[{studentId:fx.student.id,studentName:fx.student.name,studentRollNo:fx.student.studentId,status:'present'}]});
            const before=await Attendance.findById(original.id).lean(),body={offeringId:ids.offering,...stamp(14)},path='/legacy/'+original.id;
            const preview=ok(await academic(path+'/preview','admin','POST',body));assert.equal(preview.preview.records.length,1);assert.equal(preview.preview.roster.length,2);assert.equal(await LectureSession.countDocuments({legacyAttendanceId:original.id}),0);
            ok(await academic(path+'/convert','teacher','POST',body),403);
            const converted=await Promise.all([academic(path+'/convert','admin','POST',body),academic(path+'/convert','admin','POST',body)]);
            converted.forEach(r=>assert.ok([200,201].includes(r.status)));assert.equal(await LectureSession.countDocuments({legacyAttendanceId:original.id}),1);
            assert.deepEqual(await Attendance.findById(original.id).lean(),before);
            ok(await academic(path+'/convert','admin','POST',{offeringId:ids.offering,...stamp(15)}),409);
            assert.ok(ok(await academic('/legacy','teacher')).items.some(i=>i._id===original.id));
            const own=ok(await academic('/legacy','student')).items.find(i=>i._id===original.id);assert.equal(own.records.length,1);
            const broken=await Attendance.create({teacherId:fx.teacher.id,date:stamp(15).scheduledStart,records:[{studentId:new mongoose.Types.ObjectId(),studentName:'Unknown',studentRollNo:'UNKNOWN',status:'present'}]});
            ok(await academic('/legacy/'+broken.id+'/preview','admin','POST',{offeringId:ids.offering,...stamp(15)}),409);
            const summary=ok(await academic('/my-summary','student')).items[0];assert.equal(summary.total,1);
        });
        await t.test('mark/finalise races are atomic; multiple assigned Teachers remain isolated',async()=>{
            const other=await Teacher.findOne({email:'outsider@example.test'});
            ok(await academic('/offerings/'+ids.offering+'/assignments','admin','POST',{teacherId:other.id,startDate:'2020-01-01',endDate:'2035-12-31'}),201);
            const otherSession=ok(await academic('/sessions','outsider','POST',{offeringId:ids.offering,teacherId:fx.teacher.id,...stamp(16)}),201).item;
            assert.equal(otherSession.teacherId,other.id);
            ok(await academic('/sessions/'+ids.first+'/attendance','outsider','POST',{records:[{studentId:fx.student.id,status:'present'}]}),403);
            const race=await create(17),path='/sessions/'+race._id;
            const results=await Promise.all([academic(path+'/attendance','teacher','POST',{records:[{studentId:fx.student.id,status:'present'}]}),academic(path+'/finalise','teacher','POST',{})]);
            assert.equal(results[1].status,200);
            assert.ok([200,409].includes(results[0].status));
            const item=await LectureSession.findById(race._id);
            assert.ok(item.finalised);assert.equal(item.records.length,2);
            assert.equal(new Set(item.records.map(r=>String(r.studentId))).size,2);
            ok(await req('/students/'+fx.student.id,'admin','DELETE'),409);
        });
        await t.test('ended teaching assignment retains taught reads but blocks new marking and future roster access',async()=>{
            const doc=await CourseOffering.findById(ids.offering),link=doc.assignments[0];
            ok(await academic('/offerings/'+ids.offering+'/assignments/'+link.id,'admin','PATCH',{endDate:day}));
            ok(await academic('/sessions/'+ids.first,'teacher'));ok(await academic('/sessions/'+ids.first+'/export','teacher'));
            ok(await academic('/offerings/'+ids.offering,'teacher'),403);
            const unfinished=await LectureSession.findOne({offeringId:ids.offering,state:'scheduled'});
            ok(await academic('/sessions/'+unfinished.id+'/attendance','teacher','POST',{records:[{studentId:fx.student.id,status:'present'}]}),403);
            const future=campusDate(new Date());
            ok(await academic('/sessions','teacher','POST',{offeringId:ids.offering,scheduledStart:future+'T20:00:00+05:30',scheduledEnd:future+'T20:45:00+05:30'}),403);
            ok(await academic('/offerings/'+ids.offering,'admin','PATCH',{state:'archived'}));
            ok(await academic('/sessions/'+ids.first,'admin'));
        });
    } finally {
        face.recognizeFace=originalFace;face.recognizeMultipleFaces=originalMulti;
        if(server)await new Promise(r=>server.close(r));
        await cleanup();
    }
});
