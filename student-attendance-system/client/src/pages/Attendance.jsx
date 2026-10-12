import React, { useEffect, useState } from 'react';
import { ClipboardCheck, ClipboardList, Scan, Download, Image } from 'lucide-react';
import TakeAttendance from '../components/Attendance/TakeAttendance';
import AttendanceList from '../components/Attendance/AttendanceList';
import FaceAttendance from '../components/Attendance/FaceAttendance';
import DownloadAttendance from '../components/Attendance/DownloadAttendance';
import PhotoUpload from '../components/Attendance/PhotoUpload';
import Card from '../components/common/Card';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

const Attendance = () => {
    const [activeTab, setActiveTab] = useState('face');
    const [refreshKey, setRefreshKey] = useState(0);
    const [searchParams,setSearchParams] = useSearchParams();
    const [sessions,setSessions] = useState([]), [offerings,setOfferings] = useState([]);
    const [courseId,setCourseId] = useState(''), [sessionId,setSessionId] = useState(searchParams.get('session') || '');
    const [error,setError] = useState(''), [busy,setBusy] = useState(false), [marking,setMarking] = useState(false);
    useEffect(() => {
        let cancelled = false;setBusy(true);
        Promise.all([api.get('/academic/sessions'),api.get('/academic/offerings')])
            .then(([s,o]) => {if (!cancelled) {setSessions(s.data.items || []);setOfferings(o.data.items || []);setError('');}})
            .catch(e => {if (!cancelled) setError(e.response?.data?.message || 'Could not load your sessions. Please retry.');})
            .finally(() => {if (!cancelled) setBusy(false);});
        return () => {cancelled = true;};
    },[refreshKey]);
    const selected = sessions.find(s => s._id === sessionId);
    const reason = !sessionId ? 'Select a course/class and lecture session before marking attendance.' : !selected ? 'The selected session is unavailable.' : !selected.canMark ? 'This session is read-only: it is finalised, cancelled, or outside your effective assignment.' : !selected.roster.length ? 'No eligible students are enrolled for this lecture. Ask Admin to review enrolments.' : '';
    const campus = date => new Date(date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
    const courseLabel = o => [o.courseId?.code,o.courseId?.name,o.classGroupId?.label,o.classGroupId?.section,o.termId?.name].filter(Boolean).join(' · ');
    const handleAttendanceMarked = () => setRefreshKey(prev => prev + 1);
    function chooseSession(id) {setSessionId(id);setSearchParams(id ? {session:id} : {},{replace:true});}
    const tabs = [
        { id: 'face', label: 'Live Video', icon: Scan },
        { id: 'photo', label: 'Photo Upload', icon: Image },
        { id: 'take', label: 'Manual', icon: ClipboardCheck },
        { id: 'view', label: 'Today', icon: ClipboardList },
        { id: 'download', label: 'Download', icon: Download }
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h1 className="text-title">Attendance Management</h1>
                <p className="text-subtext mt-1">Manage and track student attendance</p>
            </div>

            <Card className="p-4 sm:p-6 space-y-3">
                <p className="text-sm text-zinc-400">Choose the lecture for Live Video, Photo Upload or Manual. Today and Download include separate sessions and clearly labelled legacy records.</p>
                {error && <p role="alert" className="text-red-300">{error} <button className="underline" onClick={handleAttendanceMarked}>Retry</button></p>}
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Course / class
                        <select className="input-field mt-1" aria-label="Course / class" value={courseId} disabled={busy || marking} onChange={e => {setCourseId(e.target.value);chooseSession('');}}>
                            <option value="">All my courses/classes</option>
                            {offerings.map(o => <option key={o._id} value={o._id}>{courseLabel(o)}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">Lecture session (Asia/Kolkata)
                        <select className="input-field mt-1" aria-label="Lecture session" value={sessionId} disabled={busy || marking} onChange={e => chooseSession(e.target.value)}>
                            <option value="">Select a session</option>
                            {sessions.filter(s => !courseId || s.offeringId === courseId).map(s => <option key={s._id} value={s._id}>{s.offering?.course?.code} · {s.offering?.classGroup?.label} {s.offering?.classGroup?.section} · {s.offering?.term?.name} · {campus(s.scheduledStart)} · {s.state} / {s.finalised ? 'Finalised' : 'Unfinalised'}</option>)}
                        </select>
                    </label>
                </div>
                {busy && <p className="text-sm text-zinc-400">Loading sessions…</p>}
                {reason && <p className="text-sm text-amber-300">{reason}</p>}
                {!busy && !sessions.some(s => s.canMark) && <p className="text-sm text-zinc-400">No editable lecture is available. Create a session within your assignment; archived structures or ended assignments require Admin review.</p>}
                <Link className="text-sm text-blue-300 underline" to={courseId ? '/academic/offerings/'+courseId : '/academic'}>View courses / create a session</Link>
                {selected && <div className="text-sm space-y-1"><p>{selected.offering?.course?.name} · {selected.offering?.term?.name} · {selected.offering?.classGroup?.label} / {selected.offering?.classGroup?.section}</p><p>{campus(selected.scheduledStart)} – {campus(selected.scheduledEnd)} · Teacher: {selected.teacher?.name} · {selected.state} · {selected.finalised ? 'Finalised' : 'Unfinalised'}</p><Link className="text-blue-300 underline" to={'/academic/sessions/'+sessionId}>Review / finalise this session</Link></div>}
            </Card>
            <Card className="overflow-hidden p-4 sm:p-6">
                <div className="mb-6">
                    <div className="flex flex-wrap gap-1 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    disabled={marking} onClick={() => setActiveTab(tab.id)}
                                    className={`flex flex-1 min-w-[80px] items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-medium transition-all duration-200 ${
                                        activeTab === tab.id
                                            ? 'border border-zinc-700 bg-zinc-800 text-white'
                                            : 'border border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeTab === 'face' && <FaceAttendance key={sessionId} sessionId={sessionId} disabledReason={reason} onBusyChange={setMarking} onAttendanceMarked={handleAttendanceMarked} />}
                {activeTab === 'photo' && <PhotoUpload key={sessionId} sessionId={sessionId} disabledReason={reason} onBusyChange={setMarking} onAttendanceMarked={handleAttendanceMarked} />}
                {activeTab === 'take' && <TakeAttendance key={sessionId} sessionId={sessionId} disabledReason={reason} onBusyChange={setMarking} onAttendanceMarked={handleAttendanceMarked} />}
                {activeTab === 'view' && <AttendanceList key={refreshKey} onAttendanceMarked={handleAttendanceMarked} />}
                {activeTab === 'download' && <DownloadAttendance />}
            </Card>
        </div>
    );
};

export default Attendance;
