const {AcademicTerm,ClassGroup,Course,CourseOffering,LectureSession}=require('../src/models/Academic');
const Attendance=require('../src/models/Attendance');
const A=require('../src/services/academicService');
async function academicDemo(fx) {
    const term=await AcademicTerm.create({name:'ISOLATED DEMO TERM',startDate:'2020-01-01',endDate:'2035-12-31'});
    const group=await ClassGroup.create({label:'ISOLATED DEMO CLASS',section:'A'});
    const course=await Course.create({code:'DEMO-RESTORE',name:'Restoration test course'});
    const offering=await CourseOffering.create({courseId:course.id,termId:term.id,classGroupId:group.id,
        assignments:[{teacherId:fx.teacher.id,startDate:'2020-01-01',endDate:'2035-12-31'}],
        enrolments:[fx.student,fx.otherStudent].map(s=>({studentId:s.id,startDate:'2020-01-01',endDate:'2035-12-31'}))});
    const day=A.campusDate(new Date());
    const sessions=[];
    for(const minute of [0,2]) sessions.push(await LectureSession.create({offeringId:offering.id,teacherId:fx.teacher.id,
        scheduledStart:day+'T00:0'+minute+':00+05:30',scheduledEnd:day+'T00:0'+(minute+1)+':00+05:30',campusDate:day,
        createdBy:fx.users.teacher.id,updatedBy:fx.users.teacher.id}));
    const legacy=await Attendance.create({teacherId:fx.teacher.id,date:new Date(),subject:'ISOLATED LEGACY',records:[{studentId:fx.student.id,studentName:fx.student.name,studentRollNo:fx.student.studentId,status:'late'}]});
    return {offering,first:sessions[0],second:sessions[1],legacy,day};
}
module.exports={academicDemo};