const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seed, cleanup, password } = require('./fixtures');
const { AcademicTerm, ClassGroup, Course, CourseOffering, LectureSession } = require('../src/models/Academic');

test('Student course percentages use isolated offerings and eligible finalised sessions', async t => {
    let server;
    const fx = await seed();
    try {
        server = require('../src/app').listen(0, '127.0.0.1');
        await new Promise(r => server.once('listening', r));
        const root = 'http://127.0.0.1:' + server.address().port + '/api';
        async function login(role) {
            const res = await fetch(root + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({email:fx.users[role].email,password}) });
            assert.equal(res.status,200);
            return (await res.json()).token;
        }
        const token = await login('student');
        async function summary(auth = token, query = '') {
            const res = await fetch(root + '/academic/my-summary' + query, { headers:{Authorization:'Bearer ' + auth} });
            return {status:res.status, data:await res.json()};
        }
        await t.test('empty enrolments return an empty list rather than a combined percentage', async () => {
            const res = await summary();
            assert.equal(res.status,200); assert.deepEqual(res.data.items,[]);
            assert.equal('percentage' in res.data,false);
        });
        const term = await AcademicTerm.create({name:'Isolated term',startDate:'2020-01-01',endDate:'2035-12-31'});
        const nextTerm = await AcademicTerm.create({name:'Isolated next term',startDate:'2020-01-01',endDate:'2035-12-31'});
        const group = await ClassGroup.create({label:'Isolated class',section:'A'});
        const courses = await Course.create([{code:'MATH',name:'Mathematics'},{code:'PHY',name:'Physics'},{code:'EMPTY',name:'No lectures'},{code:'PRIVATE',name:'Other student only'}]);
        async function offering(course, options = {}) {
            return CourseOffering.create({courseId:course.id,termId:options.term || term.id,classGroupId:group.id,
                enrolments:options.history ? [] : [{studentId:options.other ? fx.otherStudent.id : fx.student.id,startDate:'2020-01-01',endDate:'2035-12-31'}]});
        }
        const maths = await offering(courses[0]), physics = await offering(courses[1]), empty = await offering(courses[2]);
        const repeatedCourse = await offering(courses[0],{term:nextTerm.id,history:true});
        const privateOffering = await offering(courses[3],{other:true});
        let hour = 0;
        async function lecture(offering, status, options = {}) {
            const student = options.other ? fx.otherStudent : fx.student;
            const start = new Date(Date.UTC(2026,0,1,hour++));
            return LectureSession.create({offeringId:offering.id,teacherId:fx.teacher.id,scheduledStart:start,
                scheduledEnd:new Date(start.getTime()+1800000),campusDate:'2026-01-01',
                state:options.state || 'completed',finalised:options.finalised ?? true,attendanceStarted:true,
                roster:[{studentId:student.id,name:student.name,rollNo:student.studentId}],
                records:[{studentId:student.id,status,method:'manual',markedAt:start}],
                createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id});
        }
        await lecture(maths,'present'); await lecture(maths,'late'); await lecture(maths,'absent');
        await lecture(physics,'absent'); await lecture(repeatedCourse,'present');
        await lecture(maths,'absent',{state:'cancelled'});
        await lecture(maths,'absent',{state:'scheduled',finalised:false});
        await lecture(maths,'absent',{finalised:false});
        await lecture(maths,'absent',{other:true});
        await lecture(privateOffering,'present',{other:true});
        await t.test('different subjects and the same subject in different terms retain separate percentages', async () => {
            const {status,data} = await summary(); assert.equal(status,200);
            const byId = new Map(data.items.map(i => [i.offeringId,i]));
            assert.equal(byId.size,4); assert.ok(!byId.has(privateOffering.id));
            assert.deepEqual([byId.get(maths.id).present,byId.get(maths.id).total,byId.get(maths.id).percentage],[2,3,67]);
            assert.deepEqual([byId.get(physics.id).present,byId.get(physics.id).total,byId.get(physics.id).percentage],[0,1,0]);
            assert.equal(byId.get(repeatedCourse.id).percentage,100);
            assert.equal(byId.get(maths.id).course.name,'Mathematics');
            assert.equal(byId.get(maths.id).term.name,'Isolated term');
            assert.equal(byId.get(maths.id).classGroup.section,'A');
            assert.equal(byId.get(empty.id).total,0); assert.equal(byId.get(empty.id).percentage,null);
            assert.equal('percentage' in data,false);
            for (const item of data.items) { assert.equal('enrolments' in item,false); assert.equal('records' in item,false); }
        });
        await t.test('authenticated identity and Student role govern the summary despite query manipulation', async () => {
            const own = await summary(token,'?studentId=' + fx.otherStudent.id);
            assert.equal(own.data.items.find(i => i.offeringId === maths.id).percentage,67);
            assert.equal((await summary(await login('teacher'))).status,403);
            assert.equal((await summary(await login('admin'))).status,403);
            assert.equal((await summary('invalid')).status,401);
        });
    } finally {
        if (server) await new Promise(r => server.close(r));
        await cleanup();
    }
});