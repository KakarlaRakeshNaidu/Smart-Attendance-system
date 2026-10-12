const P=require('../services/studentPortalService');
const A=require('../services/academicService');
const respondError=require('../utils/respondError');
const fs=require('fs');const path=require('path');
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(error){if(req.file)fs.promises.unlink(req.file.path).catch(()=>{});respondError(res,error,'Could not load your Student information.');}};
exports.overview=wrap(async(req,res)=>{
    const [student,courses,recent]=await Promise.all([P.profile(req),P.courses(req),P.history(req,{limit:'5'})]);
    res.json({success:true,student,courses,recent:recent.items});
});
exports.courses=wrap(async(req,res)=>res.json({success:true,items:await P.courses(req)}));
exports.course=wrap(async(req,res)=>res.json({success:true,item:await P.course(req,req.params.id)}));
exports.history=wrap(async(req,res)=>res.json({success:true,...await P.history(req,req.query)}));
exports.profile=wrap(async(req,res)=>res.json({success:true,student:await P.profile(req)}));
exports.preparePhoto=wrap(async(req,res,next)=>{await P.profile(req);next();});
exports.photo=wrap(async(req,res)=>{
    if(Object.keys(req.body||{}).length)A.fail(400,'Only a profilePhoto file is accepted. Academic identity and login email are managed by staff.');
    if(!req.file)A.fail(400,'Choose a JPEG, PNG, GIF or WebP profile photo.');
    const data=await fs.promises.readFile(req.file.path);
    const valid=data.length>12&&((req.file.mimetype==='image/png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
        (req.file.mimetype==='image/jpeg'&&data[0]===255&&data[1]===216&&data[2]===255)||
        (req.file.mimetype==='image/gif'&&/^GIF8[79]a$/.test(data.subarray(0,6).toString()))||
        (req.file.mimetype==='image/webp'&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP'));
    if(!valid)A.fail(400,'The uploaded file is not a supported image.');
    const relative=path.relative(path.join(__dirname,'../../uploads'),req.file.path).split(path.sep).join('/');
    // Update only the photo; never save an embedding or any browser-supplied identity fields.
    const Student=require('../models/Student');
    const updated=await Student.findOneAndUpdate({_id:req.account.studentProfileId},{$set:{profilePhoto:'/uploads/'+relative,updatedAt:new Date()}},{new:true,runValidators:true}).select('name studentId email class section profilePhoto');
    if(!updated)A.fail(403,'Your Student profile is unavailable. Contact an Administrator.');
    req.studentProfile=updated;res.json({success:true,student:await P.profile(req),message:'Profile photo updated. Your registered face is unchanged.'});
});