import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import { CalendarCheck, User, BookOpen, LogOut } from 'lucide-react';
import api from '../../services/api';
import Loader from '../common/Loader';

const StudentDashboard = () => {
    const { user, logout } = useAuth();
    const [attendance, setAttendance] = useState([]);
    const [error, setError] = useState('');
    const [profile, setProfile]       = useState(null);
    const [loading, setLoading]        = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [attRes, profRes] = await Promise.all([
                    api.get('/attendance/me'),
                    api.get('/students/me')
                ]);
                if (attRes.data.success)  setAttendance(attRes.data.attendance || []);
                if (profRes.data.success) setProfile(profRes.data.student);
            } catch (e) {
                setError(e.response?.data?.message || 'Could not load attendance. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return <Loader />;

    const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const totalCount   = attendance.length;
    const pct          = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                        <User className="h-6 w-6 text-zinc-300" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">{user?.name}</h1>
                        <p className="text-sm text-zinc-400">Student Portal</p>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 transition-colors border border-zinc-800 rounded-2xl px-4 py-2"
                >
                    <LogOut className="h-4 w-4" /> Logout
                </button>
            </div>

            {error && <div role="alert" className="mb-6 text-red-300">{error}</div>}
            <Link to="/change-password" className="btn-secondary mb-6 inline-block">Change password</Link>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="card p-5">
                    <p className="text-zinc-400 text-sm mb-1">Attendance %</p>
                    <p className="text-3xl font-bold text-white">{pct}%</p>
                </div>
                <div className="card p-5">
                    <p className="text-zinc-400 text-sm mb-1">Classes Present</p>
                    <p className="text-3xl font-bold text-emerald-400">{presentCount}</p>
                </div>
                <div className="card p-5">
                    <p className="text-zinc-400 text-sm mb-1">Total Classes</p>
                    <p className="text-3xl font-bold text-white">{totalCount}</p>
                </div>
            </div>

            {/* Profile */}
            {profile && (
                <div className="card p-5 mb-8">
                    <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                        <BookOpen className="h-4 w-4" /> My Profile
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-zinc-500">Student ID</span><p className="text-white mt-1">{profile.studentId}</p></div>
                        <div><span className="text-zinc-500">Class</span><p className="text-white mt-1">{profile.class || '-'}</p></div>
                        <div><span className="text-zinc-500">Section</span><p className="text-white mt-1">{profile.section || '-'}</p></div>
                        <div><span className="text-zinc-500">Email</span><p className="text-white mt-1">{user?.email}</p></div>
                    </div>
                </div>
            )}

            {/* Attendance list */}
            <div className="card p-5">
                <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4" /> My Attendance History
                </h2>
                {attendance.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No attendance records found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-zinc-500 border-b border-zinc-800">
                                    <th className="text-left pb-3">Date</th>
                                    <th className="text-left pb-3">Subject</th>
                                    <th className="text-left pb-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {attendance.map((rec, i) => (
                                    <tr key={i}>
                                        <td className="py-3 text-zinc-300">
                                            {new Date(rec.date).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 text-zinc-400">{rec.subject || '-'}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                                                rec.status === 'present' ? 'bg-emerald-500/15 text-emerald-400' :
                                                rec.status === 'late'    ? 'bg-amber-500/15 text-amber-400' :
                                                'bg-red-500/15 text-red-400'
                                            }`}>
                                                {rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentDashboard;
