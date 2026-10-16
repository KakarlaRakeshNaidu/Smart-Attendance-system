import React, { useState, useEffect, useRef } from 'react';
import studentService from '../../services/studentService';
import attendanceService from '../../services/attendanceService';
import { Check, X, Users, Save } from 'lucide-react';
import Loader from '../common/Loader';
import toast from 'react-hot-toast';
import api from '../../services/api';

const TakeAttendance = ({ onAttendanceMarked, sessionId, disabledReason, onBusyChange }) => {
    const [students, setStudents] = useState([]);
    const [attendance, setAttendance] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [error,setError] = useState('');
    const lock = useRef(false);
    useEffect(() => {onBusyChange?.(submitting);return () => onBusyChange?.(false);},[submitting,onBusyChange]);
    useEffect(() => {
        let cancelled = false;
        if (!sessionId) {setLoading(false);setStudents([]);return;}
        setLoading(true);
        api.get('/academic/sessions/'+sessionId).then(({data}) => {
            if (cancelled) return;
            setStudents(data.item.roster.map(r => ({_id:r.studentId,name:r.name,studentId:r.rollNo})));
            setAttendance(Object.fromEntries(data.item.records.map(r => [r.studentId,r.status])));
        }).catch(e => {if (!cancelled) setError(e.response?.data?.message || 'Failed to fetch session roster');})
            .finally(() => {if (!cancelled) setLoading(false);});
        return () => {cancelled = true;};
    },[sessionId]);
    const toggleAttendance = (studentId) => {
        setAttendance(prev => ({
            ...prev,
            [studentId]: prev[studentId] === 'present' ? 'absent' : 'present'
        }));
    };

    const markAllPresent = () => {
        const allPresent = {};
        students.forEach(student => {
            allPresent[student._id] = 'present';
        });
        setAttendance(allPresent);
    };

    const markAllAbsent = () => {
        const allAbsent = {};
        students.forEach(student => {
            allAbsent[student._id] = 'absent';
        });
        setAttendance(allAbsent);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (lock.current || !sessionId || disabledReason) return;
        lock.current = true;setSubmitting(true);

        try {
            const records = Object.entries(attendance).filter(([,status])=>status).map(([studentId, status]) => ({
                studentId,
                status
            }));

            if (!records.length) {toast.error('Select at least one attendance status.');return;}
            await api.post('/academic/sessions/'+sessionId+'/attendance',{records});
            toast.success('Attendance marked successfully!');
            if (onAttendanceMarked) onAttendanceMarked();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to mark attendance');
        } finally {
            lock.current = false;setSubmitting(false);
        }
    };

    if (loading) {
        return <Loader />;
    }

    if (error) return <p role="alert" className="text-red-300">{error}</p>;
    if (students.length === 0) {
        return (
            <div className="py-12 text-center">
                <Users className="mx-auto mb-4 h-16 w-16 text-zinc-600" />
                <p className="text-lg text-zinc-300">{sessionId ? 'No eligible students for this session' : 'Select a lecture session'}</p>
                <p className="mt-2 text-sm text-zinc-500">Profiles must be enrolled by Admin for this lecture date before taking attendance</p>
            </div>
        );
    }

    const presentCount = Object.values(attendance).filter(s => s === 'present').length;
    const absentCount = Object.values(attendance).filter(s => s === 'absent').length;

    return (
        <div>
            <p className="text-sm text-zinc-400 mb-3">Unmarked students stay not marked until you review and finalise this session.</p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <p className="text-sm text-zinc-400">
                        <span className="font-semibold text-emerald-300">{presentCount} Present</span>
                        {' | '}
                        <span className="font-semibold text-red-300">{absentCount} Absent</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <button type="button" disabled={submitting || !!disabledReason} onClick={markAllPresent} className="rounded-xl bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-500/30">
                        Mark All Present
                    </button>
                    <button type="button" disabled={submitting || !!disabledReason} onClick={markAllAbsent} className="rounded-xl bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-300 transition-all duration-200 hover:bg-red-500/30">
                        Mark All Absent
                    </button>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {students.map((student) => (
                        <div key={student._id} onClick={() => {if (!submitting && !disabledReason) toggleAttendance(student._id);}} className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all duration-200 ${attendance[student._id] === 'present' ? 'border-emerald-900 bg-emerald-500/10 hover:bg-emerald-500/20' : attendance[student._id] === 'absent' ? 'border-red-900 bg-red-500/10 hover:bg-red-500/20' : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800'}`}>
                            <div className="flex items-center space-x-3">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${attendance[student._id] === 'present' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                                    <span className={`font-semibold ${attendance[student._id] === 'present' ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {student.name?.charAt(0) || 'S'}
                                    </span>
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-100">{student.name}</p>
                                    <p className="text-sm text-zinc-500">ID: {student.studentId}</p>
                                </div>
                            </div>
                            <select aria-label={'Status '+student.studentId} className="input-field max-w-36" value={attendance[student._id] || ''} disabled={submitting || !!disabledReason} onClick={e=>e.stopPropagation()} onChange={e=>setAttendance(prev=>({...prev,[student._id]:e.target.value}))}>
                                <option value="">Not marked</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option>
                            </select>
                            <div className={`rounded-xl p-2 ${attendance[student._id] === 'present' ? 'bg-emerald-600' : attendance[student._id] === 'absent' ? 'bg-red-500' : 'bg-zinc-700'}`}>
                                {attendance[student._id] === 'present' ? (
                                    <Check className="h-5 w-5 text-media" />
                                ) : (
                                    attendance[student._id] === 'absent' ? <X className="h-5 w-5 text-media" /> : <span className="text-zinc-100">{attendance[student._id] === 'late' ? 'Late' : '—'}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <button type="submit" disabled={submitting || !!disabledReason} className="w-full btn-success mt-6 py-3 flex items-center justify-center gap-2">
                    {submitting ? (
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save className="h-5 w-5" />
                            Save Attendance
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default TakeAttendance;
