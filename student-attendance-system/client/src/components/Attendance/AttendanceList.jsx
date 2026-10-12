import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import attendanceService from '../../services/attendanceService';
import api from '../../services/api';
import { Download, ClipboardList, Trash2 } from 'lucide-react';
import Loader from '../common/Loader';
import toast from 'react-hot-toast';

const AttendanceList = ({onAttendanceMarked}) => {
    const [attendance,setAttendance] = useState([]),[loading,setLoading] = useState(true),[error,setError] = useState(''),[resetting,setResetting] = useState('');
    useEffect(() => {let cancelled=false;
        attendanceService.getTodayAttendance().then(data=>{if(!cancelled)setAttendance(data.attendance||[]);})
            .catch(e=>{if(!cancelled)setError(e.response?.data?.message||'Failed to fetch attendance');})
            .finally(()=>{if(!cancelled)setLoading(false);});
        return ()=>{cancelled=true;};
    },[]);
    async function download(){try{const blob=await attendanceService.downloadTodayAttendanceCSV();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='attendance_today.csv';a.click();URL.revokeObjectURL(url);toast.success('CSV downloaded successfully');}catch(e){toast.error(e.response?.data?.message||e.message||'Failed to download CSV');}}
    async function reset(item){
        if(resetting || !item.canMark || !window.confirm('Reset unfinalised attendance for this selected session? The saved roster will remain unchanged.'))return;
        setResetting(item.sessionId);
        try{await api.delete('/academic/sessions/'+item.sessionId+'/attendance');toast.success('Attendance reset for this session.');onAttendanceMarked?.();}
        catch(e){toast.error(e.response?.data?.message||'Failed to reset attendance');}finally{setResetting('');}
    }
    if(loading)return <Loader/>;
    const campus=date=>new Date(date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
    return <div className="space-y-4">
        {error&&<p role="alert" className="text-red-300">{error}</p>}
        <div className="flex justify-between items-center"><h2 className="text-section">Today's Attendance</h2><button onClick={download} className="btn-secondary flex gap-2 items-center"><Download className="h-4 w-4"/>Download CSV</button></div>
        <p className="text-sm text-zinc-400">Today uses Asia/Kolkata. Every lecture stays separate; unmarked is not absent. Legacy records remain read-only.</p>
        {!attendance.length&&<div className="py-12 text-center"><ClipboardList className="mx-auto mb-4 h-16 w-16 text-zinc-600"/><p className="text-lg text-zinc-300">No attendance marked for today</p><p className="mt-2 text-sm text-zinc-500">Go to Live Video or Manual tab to mark attendance after selecting a session.</p></div>}
        {attendance.map(item=><section key={item._id} className="rounded-2xl border border-zinc-800 p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{item.subject||'No subject'} · {item.class} {item.section} {item.term&&'· '+item.term}</p><p className="text-sm text-zinc-400">{item.recordType} · {campus(item.date)}{item.scheduledEnd&&' – '+campus(item.scheduledEnd)}</p>{item.sessionId&&<p className="text-sm text-zinc-400">{item.state} · {item.finalised?'Finalised':'Unfinalised'}</p>}</div>
            {item.sessionId&&<div className="flex gap-2 items-center"><Link className="text-blue-300 text-sm underline" to={'/academic/sessions/'+item.sessionId}>Review / finalise</Link>{item.canMark&&<button disabled={!!resetting} onClick={()=>reset(item)} className="btn-danger flex items-center gap-2"><Trash2 className="h-4 w-4"/>Reset Attendance</button>}</div>}</div>
            <p className="text-sm text-zinc-400">Present: {item.records.filter(r=>r.status==='present').length} · Late: {item.records.filter(r=>r.status==='late').length} · Absent: {item.records.filter(r=>r.status==='absent').length} · Not marked: {item.records.filter(r=>r.status==='not marked').length}</p>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-zinc-800 text-zinc-400">{['S.No','Student ID','Name','Status','Time'].map(label=><th key={label} className="text-left py-3 px-3">{label}</th>)}</tr></thead><tbody>{item.records.map((r,i)=><tr key={String(r.studentId)} className="border-b border-zinc-800"><td className="py-3 px-3">{i+1}</td><td className="px-3">{r.studentRollNo}</td><td className="px-3">{r.studentName}</td><td className="px-3">{r.status}</td><td className="px-3">{r.markedAt?new Date(r.markedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'}):'—'}</td></tr>)}</tbody></table></div>
        </section>)}
        <Link to="/legacy-attendance" className="text-blue-300 underline text-sm">Legacy attendance</Link>
    </div>;
};
export default AttendanceList;