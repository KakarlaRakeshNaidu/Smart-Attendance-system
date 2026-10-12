const P=require('../services/adminPortalService');
const respondError=require('../utils/respondError');
const wrap=fn=>async(req,res)=>{try{res.json({success:true,...await fn(req)});}catch(e){respondError(res,e,'Could not load Administrator records.');}};
exports.overview=wrap(()=>P.overview());
exports.accounts=wrap(req=>P.accounts(req.query));
exports.account=wrap(req=>P.accountDetail(req.params.accountId));
exports.directory=wrap(req=>P.directory(req.params.kind,req.query));
exports.profile=wrap(req=>P.profileDetail(req.params.kind,req.params.id));
exports.attendance=wrap(req=>P.attendance(req.query));