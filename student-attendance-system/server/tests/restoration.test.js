const {test}=require('node:test');
const assert=require('node:assert/strict');
const {seed,cleanup,password}=require('./fixtures');
const {academicDemo}=require('./restorationFixtures');
const {LectureSession}=require('../src/models/Academic');
const Attendance=require('../src/models/Attendance');
const Teacher=require('../src/models/Teacher'),Account=require('../src/models/Account');
const face=require('../src/services/faceRecognitionService');
test('Restored Teacher attendance entry points, reads and exports use isolated session records',async t=>{
    let server;const fx=await seed(),originalSingle=face.recognizeFace,originalMulti=face.recognizeMultipleFaces,originalHealth=face.checkHealth;
    try{
        const demo=await academicDemo(fx),legacyBefore=await Attendance.findById(demo.legacy.id).lean();
        server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
        const root='http://127.0.0.1:'+server.address().port+'/api',tokens={};
        async function req(path,role='teacher',method='GET',body){
            const res=await fetch(root+path,{method,headers:{...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
            return {status:res.status,data:res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text()};
        }
        const ok=(r,status=200)=>{assert.equal(r.status,status,r.data?.message);return r.data;};
        for(const role of ['teacher','admin','student'])tokens[role]=ok(await req('/auth/login',null,'POST',{email:fx.users[role].email,password})).token;
        const outsider=await Teacher.create({name:'ISOLATED Other Teacher',email:'restoration-other@example.test',password});
        const account=new Account({name:outsider.name,email:outsider.email,role:'teacher',teacherProfileId:outsider.id,isActive:true});await account.setPassword(password);await account.save();
        tokens.outsider=ok(await req('/auth/login',null,'POST',{email:outsider.email,password})).token;
        await t.test('face-status uses the installed health interface and reports service failures without throwing',async()=>{
            face.checkHealth=async()=>({success:true,message:'Isolated service healthy'});
            assert.equal(ok(await req('/attendance/face-status')).success,true);
            face.checkHealth=async()=>({success:false,message:'Isolated service offline'});
            const data=ok(await req('/attendance/face-status'));assert.equal(data.success,false);assert.equal(data.message,'Isolated service offline');
            face.checkHealth=originalHealth;
        });
        await t.test('Today includes both same-day lectures plus labelled legacy, including India dates across UTC midnight',async()=>{
            const data=ok(await req('/attendance/today'));assert.equal(data.attendance.length,3);
            const first=data.attendance.find(s=>s.sessionId===demo.first.id);assert.equal(first.records.length,2);assert.ok(first.records.every(r=>r.status==='not marked'));
            assert.equal(data.attendance.filter(s=>s.recordType==='Legacy attendance').length,1);
            assert.equal(ok(await req('/attendance/today','outsider')).attendance.length,0);
            ok(await req('/attendance/today','student'),403);
        });
        await t.test('original Manual endpoint accepts explicit authorised session and rejects date-only or outside-roster writes',async()=>{
            const body={sessionId:demo.first.id,records:[{studentId:fx.student.id,status:'late'}]};
            ok(await req('/attendance','teacher','POST',body));
            ok(await req('/attendance','teacher','POST',{records:body.records}),409);
            for(const role of ['admin','student','outsider'])ok(await req('/attendance',role,'POST',body),403);
            ok(await req('/attendance','teacher','POST',{sessionId:demo.first.id,records:[{studentId:outsider.id,status:'present'}]}),400);
        });
        await t.test('single-face, multiple-face and photo entry points send server roster candidates and deduplicate',async()=>{
            let seen=[];const match=async(image,candidates)=>{seen=candidates;return {success:true,students:[{studentId:fx.student.studentId,confidence:0.97}],recognizedStudents:[{studentId:fx.student.studentId,confidence:0.97}],totalFaces:2,unrecognizedCount:1};};
            face.recognizeFace=match;face.recognizeMultipleFaces=match;
            for(const path of ['/attendance/face','/attendance/face-multiple','/attendance/bulk-photos']){
                const result=ok(await req(path,'teacher','POST',{sessionId:demo.first.id,image:'ISOLATED IMAGE',candidateIds:['OUTSIDE']}));
                assert.equal(result.unrecognizedCount,1);assert.deepEqual(seen.sort(),[fx.student.studentId,fx.otherStudent.studentId].sort());
            }
            assert.equal((await LectureSession.findById(demo.first.id)).records.length,1);
            assert.ok(ok(await req('/attendance/face','teacher','POST',{sessionId:demo.first.id,image:'ISOLATED IMAGE'})).alreadyMarked);
            face.recognizeFace=async()=>({success:true,students:[{studentId:'OUTSIDE'}]});
            ok(await req('/attendance/face','teacher','POST',{sessionId:demo.first.id,image:'ISOLATED IMAGE'}),502);
            assert.equal((await LectureSession.findById(demo.first.id)).records.length,1);
        });
        await t.test('face-service failure does not block Manual or change saved attendance',async()=>{
            face.recognizeFace=async()=>({success:false,httpStatus:503,code:'FACE_SERVICE_UNAVAILABLE',message:'Isolated face service unavailable'});
            ok(await req('/attendance/face','teacher','POST',{sessionId:demo.second.id,image:'ISOLATED IMAGE'}),503);
            ok(await req('/attendance','teacher','POST',{sessionId:demo.second.id,records:[{studentId:fx.otherStudent.id,status:'present'}]}));
            assert.equal((await LectureSession.findById(demo.second.id)).records.length,1);
        });
        await t.test('daily and range CSVs preserve distinct session identity and authorised scope; source filters retain legacy access',async()=>{
            for(const path of ['/attendance/download/today','/attendance/download/'+demo.day,'/attendance/download/range?fromDate='+demo.day+'&toDate='+demo.day]){
                for(const role of ['teacher','admin']){const csv=ok(await req(path,role));assert.ok(csv.includes(demo.first.id));assert.ok(csv.includes(demo.second.id));assert.ok(csv.includes(demo.legacy.id));assert.ok(csv.includes('DEMO-RESTORE'));assert.ok(csv.includes('not marked'));}
                const outside=ok(await req(path,'outsider'));assert.ok(!outside.includes(demo.first.id));ok(await req(path,'student'),403);
            }
            const legacy=ok(await req('/attendance/download/'+demo.day+'?source=legacy'));assert.ok(!legacy.includes(demo.first.id));assert.ok(legacy.includes(demo.legacy.id));
            const sessions=ok(await req('/attendance/download/'+demo.day+'?source=sessions'));assert.ok(sessions.includes(demo.first.id));assert.ok(!sessions.includes(demo.legacy.id));
            ok(await req('/attendance/download/'+demo.day+'?source=invalid'),400);
        });
        await t.test('Reset keeps captured roster, finalisation prevents overwrites, and legacy documents stay unchanged',async()=>{
            ok(await req('/attendance/today?sessionId='+demo.second.id,'teacher','DELETE'));
            let doc=await LectureSession.findById(demo.second.id);assert.equal(doc.records.length,0);assert.equal(doc.roster.length,2);
            ok(await req('/academic/sessions/'+demo.first.id+'/finalise','teacher','POST',{}));
            ok(await req('/attendance/today?sessionId='+demo.first.id,'teacher','DELETE'),409);
            ok(await req('/attendance','teacher','POST',{sessionId:demo.first.id,records:[{studentId:fx.student.id,status:'absent'}]}),409);
            assert.deepEqual(await Attendance.findById(demo.legacy.id).lean(),legacyBefore);
        });
    }finally{face.recognizeFace=originalSingle;face.recognizeMultipleFaces=originalMulti;face.checkHealth=originalHealth;if(server)await new Promise(r=>server.close(r));await cleanup();}
});