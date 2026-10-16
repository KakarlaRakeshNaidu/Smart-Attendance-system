const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net'),path = require('node:path');
const mongoose = require('mongoose');
const {seed,cleanup,password} = require('./fixtures');
test('Express -> real Flask -> isolated MongoDB -> cosine matching -> session attendance',async t=>{
    const fx=await seed();let api,python;const tokens={};
    try {
        const free=net.createServer();await new Promise(r=>free.listen(0,'127.0.0.1',r));const port=free.address().port;await new Promise(r=>free.close(r));
        const uri=new URL(process.env.MONGODB_URI);uri.pathname='/'+mongoose.connection.name;
        const directory=path.join(__dirname,'../python'),interpreter=path.join(directory,'.venv/bin/python');
        python=spawn(interpreter,['tests/serve_fixture.py'],{cwd:directory,env:{...process.env,MONGODB_URI:uri.toString(),FACE_FIXTURE_PORT:String(port)},stdio:'ignore'});
        let healthy=false;
        for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/api/health');if(r.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
        assert.ok(healthy,'Test Flask service must start');
        process.env.FACE_API_URL='http://127.0.0.1:'+port+'/api';
        const {AcademicTerm,ClassGroup,Course,CourseOffering,LectureSession}=require('../src/models/Academic');
        await Promise.all([AcademicTerm,ClassGroup,Course,CourseOffering,LectureSession].map(m=>m.init()));
        const Student=require('../src/models/Student');
        // Both have matching synthetic vectors; only one belongs to the offering.
        await Student.updateMany({_id:{$in:[fx.student._id,fx.otherStudent._id]}},{$set:{faceEmbedding:Array(512).fill(1)}});
        const term=await AcademicTerm.create({name:'ISOLATED FACE TERM',startDate:'2020-01-01',endDate:'2035-12-31'});
        const group=await ClassGroup.create({label:'ISOLATED FACE CLASS',section:'A'});
        const course=await Course.create({code:'FACE-DEMO',name:'Isolated face contract'});
        const offering=await CourseOffering.create({termId:term.id,classGroupId:group.id,courseId:course.id,assignments:[{teacherId:fx.teacher.id,startDate:'2020-01-01',endDate:'2035-12-31'}],enrolments:[{studentId:fx.student.id,startDate:'2020-01-01',endDate:'2035-12-31'}]});
        api=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>api.once('listening',r));
        const base='http://127.0.0.1:'+api.address().port+'/api';
        async function request(url,body,role='teacher') {const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
        tokens.teacher=(await request('/auth/login',{email:fx.users.teacher.email,password})).data.token;
        const day=require('../src/services/academicService').campusDate(new Date(Date.now()-86400000));
        const session=await request('/academic/sessions',{offeringId:offering.id,scheduledStart:day+'T08:00:00+05:30',scheduledEnd:day+'T08:45:00+05:30'});
        assert.equal(session.status,201);
        const url='/academic/sessions/'+session.data.item._id+'/recognise';
        await t.test('single recognition filters outside profile and saves the eligible match',async()=>{
            const r=await request(url,{image:Buffer.from('synthetic test image').toString('base64'),mode:'single',candidateIds:[fx.otherStudent.studentId]});
            assert.equal(r.status,200,r.data.message);assert.equal(r.data.recognized.length,1);assert.equal(r.data.recognized[0].studentId,fx.student.studentId);
            assert.ok(r.data.recognized[0].confidence>0.99);assert.equal(r.data.item.records.length,1);
        });
        await t.test('actual multi/photo integration repeats without duplicate session marks',async()=>{
            for(const method of ['face','photo']) {const r=await request(url,{image:Buffer.from('synthetic test image').toString('base64'),mode:'multiple',method});assert.equal(r.status,200,r.data.message);assert.equal(r.data.totalFaces,1);assert.equal(r.data.item.records.length,1);}
            const saved=await LectureSession.findById(session.data.item._id);assert.equal(saved.records[0].studentId.toString(),fx.student.id);assert.equal(saved.records[0].method,'photo');
        });
        await t.test('real Flask no-embedding result remains clean and manual marking works',async()=>{
            await Student.updateOne({_id:fx.student.id},{$unset:{faceEmbedding:1}});
            const r=await request(url,{image:Buffer.from('synthetic test image').toString('base64'),mode:'single'});assert.equal(r.status,400);
            assert.ok(r.data.message.includes('registered faces'));
            const manual=await request('/academic/sessions/'+session.data.item._id+'/attendance',{records:[{studentId:fx.student.id,status:'late'}]});assert.equal(manual.status,200);assert.equal(manual.data.item.records.length,1);
        });
        await t.test('face registration for existing profiles uses real Flask and preserves private embedding storage',async()=>{
            // Avoid touching any real upload directories, even when a fixture roll number matches.
            await Student.updateOne({_id:fx.student.id},{$set:{profilePhoto:'/uploads/isolated-placeholder.jpg'}});
            const registered=await request('/students/'+fx.student.id+'/register-face',{faceImage:Buffer.from('isolated registration image').toString('base64')});
            assert.equal(registered.status,200,registered.data.message);
            assert.ok(!JSON.stringify(registered.data).includes('faceEmbedding'));
            const listed=await fetch(base+'/students',{headers:{Authorization:'Bearer '+tokens.teacher}});const profiles=(await listed.json()).students;
            assert.equal(profiles.find(s=>s._id===fx.student.id).faceRegistered,true);assert.ok(profiles.every(s=>!('faceEmbedding' in s)));
            const stored=await Student.findById(fx.student.id).select('+faceEmbedding');assert.equal(stored.faceEmbedding.length,512);
            tokens.student=(await request('/auth/login',{email:fx.users.student.email,password})).data.token;
            assert.equal((await request('/students/'+fx.student.id+'/register-face',{faceImage:'isolated'},'student')).status,403);
        });
    } finally {
        if(api)await new Promise(r=>api.close(r));
        if(python&&python.exitCode===null){const stopped=new Promise(r=>python.once('exit',r));python.kill('SIGTERM');await stopped;}
        await cleanup();
    }
});
