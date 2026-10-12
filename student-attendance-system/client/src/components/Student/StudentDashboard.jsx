import React from 'react';
import {Link} from 'react-router-dom';
import {StudentShell,StudentState,useStudentData,CourseSummary,AttendanceTable,ProfileFields} from './StudentPortalPages';
const StudentDashboard=()=>{
    const request=useStudentData('/student-portal/overview');const data=request.data;
    return <StudentShell><StudentState request={request}/>{data&&<>
        <section className="card p-5"><p className="text-lg font-semibold">{data.student.name} · {data.student.studentId}</p><p className="text-zinc-400">{data.student.class||'Class not recorded'} {data.student.section||''}</p><p className="mt-3">Active enrolled courses: {data.courses.filter(c=>c.enrolmentStatus==='active').length}</p></section>
        <CourseSummary items={data.courses}/>
        <section className="card p-5 space-y-3"><h2 className="font-semibold">My Profile</h2><ProfileFields student={data.student}/></section>
        <section className="card p-5 space-y-3"><h2 className="font-semibold">My Lecture Attendance (Asia/Kolkata)</h2><p className="text-sm text-zinc-400">Your five most recent records, including clearly labelled legacy attendance.</p><AttendanceTable items={data.recent}/><Link className="btn-secondary inline-block" to="/my-attendance/history">View full attendance history</Link></section>
    </>}</StudentShell>;
};
export default StudentDashboard;