const {test}=require('node:test');
const assert=require('node:assert/strict');
const {seed,cleanup,password}=require('./fixtures');
const Student=require('../src/models/Student');
const Account=require('../src/models/Account');
test('Administrator student total counts profiles, including students without login accounts',async()=>{
 let server;const fx=await seed();
 try{
  server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  async function token(role){const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fx.users[role].email,password})});assert.equal(response.status,200);return (await response.json()).token;}
  const adminToken=await token('admin');
  async function counts(){const response=await fetch(base+'/admin/accounts',{headers:{Authorization:'Bearer '+adminToken}});assert.equal(response.status,200);return response.json();}
  let data=await counts();assert.equal(data.studentCount,2);assert.equal(data.accounts.filter(a=>a.role==='student').length,1);assert.equal(data.count,3);
  await Student.create({studentId:'COUNT-ONLY',name:'Isolated profile without account'});
  data=await counts();assert.equal(data.studentCount,3);assert.equal(data.count,3);
  await Account.updateOne({_id:fx.users.student.id},{$set:{isActive:false}});
  data=await counts();assert.equal(data.studentCount,3);
  for(const role of ['teacher','student']){
   if(role==='student')await Account.updateOne({_id:fx.users.student.id},{$set:{isActive:true}});
   const response=await fetch(base+'/admin/accounts',{headers:{Authorization:'Bearer '+await token(role)}});assert.equal(response.status,403);
  }
 }finally{if(server)await new Promise(r=>server.close(r));await cleanup();}
});