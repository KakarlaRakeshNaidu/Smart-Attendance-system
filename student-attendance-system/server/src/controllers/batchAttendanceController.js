const A=require('../services/academicService'), D=require('../services/administrationService'), B=require('../services/batchAttendanceService');
const { LectureSession }=require('../models/Academic');
const academic=require('./academicController');
const face=require('../services/faceRecognitionService');
const ok=(res,data,status=200)=>res.status(status).json({success:true,...data});
exports.manual=D.wrap(async(req,res)=>{
 const session=await B.ensure(req);req.params.id=session.id;
 const item=await academic.markSession(req,req.body.records,'manual');
 await D.audit(req,'MARK_BATCH_ATTENDANCE','LectureSession',item.id,{count:req.body.records.length,batch:item.batch});
 ok(res,{attendance:await B.view(item),message:'Attendance saved. Finalise the session when marking is complete.'},201);
});
async function recognise(req,images,single){
 if(!Array.isArray(images)||images.length<1||images.length>20||images.some(i=>typeof i!=='string'||!i.startsWith('data:image/')))A.fail(400,'Provide between 1 and 20 images.');
 const session=await B.ensure(req);req.params.id=session.id;
 const doc=await A.canMark(req,session);
 const roster=session.attendanceStarted?session.roster:await A.roster(doc,session.campusDate);
 const candidates=roster.map(s=>s.rollNo),matches=new Map();let unrecognizedCount=0,totalFaces=0;
 for(const image of images){
  const result=await (single?face.recognizeFace(image,candidates):face.recognizeMultipleFaces(image,candidates));
  if(!result.success)A.fail(result.httpStatus||400,result.message||'Face recognition failed.',result.code);
  const rows=single?result.students:result.recognizedStudents;
  if(!Array.isArray(rows)||rows.some(row=>!candidates.includes(row.studentId)))A.fail(502,'The face service returned a match outside the authorised batch.');
  for(const row of rows)matches.set(row.studentId,{studentId:row.studentId,name:roster.find(s=>s.rollNo===row.studentId).name,confidence:row.confidence});
  unrecognizedCount+=result.unrecognizedCount||0;totalFaces+=result.totalFaces||rows.length;
 }
 const recognizedStudents=[...matches.values()];
 const alreadyMarkedStudents=recognizedStudents.filter(row=>session.records.some(m=>String(m.studentId)===String(roster.find(s=>s.rollNo===row.studentId).studentId)&&m.status==='present'));
 if(!recognizedStudents.length)A.fail(400,'No eligible faces were recognised.');
 const saved=await academic.markSession(req,recognizedStudents.map(row=>({studentId:roster.find(s=>s.rollNo===row.studentId).studentId,status:'present'})),images.length>1||req.body.method==='photo'?'photo':'face');
 await D.audit(req,'RECOGNISE_BATCH_ATTENDANCE','LectureSession',saved.id,{recognizedCount:recognizedStudents.length});
 return {attendance:await B.view(saved),student:recognizedStudents[0],students:recognizedStudents,recognizedStudents,recognized:recognizedStudents,alreadyMarked:single&&alreadyMarkedStudents.length>0,alreadyMarkedStudents,unrecognizedCount,totalFaces,recognizedCount:recognizedStudents.length,markedCount:recognizedStudents.length-alreadyMarkedStudents.length,message:`${recognizedStudents.length} eligible student(s) recognised.`};
}
exports.recognise=D.wrap(async(req,res)=>ok(res,await recognise(req,[req.body.image],req.path==='/face')));
exports.photos=D.wrap(async(req,res)=>{const images=req.body.images||req.body.photos||(req.body.image?[req.body.image]:null);ok(res,await recognise(req,Array.isArray(images)?images.map(i=>typeof i==='string'?i:i.image||i.data):images,false));});
exports.list=D.wrap(async(req,res)=>{const today=A.campusDate(new Date()),from=req.path==='/today'?today:req.params.date||req.query.fromDate,to=req.path==='/today'?today:req.params.date||req.query.toDate;const sessions=await B.read(req,from,to);ok(res,{sessions,attendance:sessions,count:sessions.length});});
exports.download=D.wrap(async(req,res)=>{const today=A.campusDate(new Date()),from=(req.params.date==='today'?today:req.params.date)||req.query.startDate||req.query.fromDate||today,to=(req.params.date==='today'?today:req.params.date)||req.query.endDate||req.query.toDate||from;res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="attendance.csv"'}).send(B.csv(await B.read(req,from,to)));});
exports.reset=D.wrap(async(req,res)=>{
 const filter={teacherId:req.teacherId,campusDate:A.campusDate(new Date()),batchKey:{$exists:true}};
 // A reset must always identify exactly one authorised batch.
 const batch=D.accessFields(req.query);await D.access(req,batch);for(const field of ['academicYear','branch','section','subsection'])filter['batch.'+field]=batch[field];
 const docs=await LectureSession.find(filter);if(!docs.length)A.fail(404,'No attendance exists for this batch today.');
 for(const doc of docs)await A.canMark(req,doc);
 for(const doc of docs)await A.changeSession(doc.id,async current=>{await A.canMark(req,current);return {records:[],updatedBy:req.accountId};});
 await D.audit(req,'RESET_BATCH_ATTENDANCE','LectureSession',docs[0].id,batch);ok(res,{message:'Marks cleared. The saved session roster is preserved.'});
});
