import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ChevronRight, User } from 'lucide-react';
import { ThemeControl } from './ThemeControl';
import { useAuth } from '../../context/authContextState';
const titles = [
    ['/admin/dashboard', 'Overview'],
    ['/student/dashboard', 'Overview'],
    ['/dashboard', 'Overview'],
    ['/admin/teachers', 'Teachers'],
    ['/admin/students', 'Students'],
    ['/admin/accounts', 'Accounts'],
    ['/admin/classes', 'Classes'],
    ['/admin/subjects', 'Subjects'],
    ['/admin/enrollments', 'Enrollments'],
    ['/admin/assignments', 'Assignments'],
    ['/admin/attendance', 'Attendance'],
    ['/admin/audit-logs', 'Audit logs'],
    ['/lecture-attendance', 'Lecture attendance'],
    ['/attendance-analytics', 'Analytics'],
    ['/attendance-corrections', 'Corrections'],
    ['/semester-reports', 'Semester reports'],
    ['/student/reports', 'Attendance report'],
    ['/student/attendance', 'My attendance'],
    ['/my-attendance/history', 'Attendance history'],
    ['/students', 'Student directory'],
    ['/attendance', 'Batch attendance'],
    ['/academic', 'Courses & lectures'],
    ['/legacy-attendance', 'Legacy attendance'],
    ['/notifications', 'Notifications'],
    ['/change-password', 'Settings']
];
export default function Navbar({ onMenuToggle }) {
    const { role, user } = useAuth(),
        { pathname } = useLocation(),
        [clock, setClock] = useState('');
    useEffect(() => {
        const update = () =>
            setClock(
                new Date().toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            );
        update();
        const timer = setInterval(update, 30000);
        return () => clearInterval(timer);
    }, []);
    const title = pathname.includes('profile')
        ? 'Profile'
        : titles.find(([path]) => pathname === path || pathname.startsWith(path + '/'))?.[1] || 'Workspace';
    const profile =
        role === 'admin' ? '/admin/profile' : role === 'student' ? '/student/profile' : '/profile';
    return (
        <header className="app-topbar">
            <div className="flex items-center gap-3 min-w-0">
                <button
                    className="icon-button lg:hidden"
                    onClick={onMenuToggle}
                    aria-label="Open menu"
                    aria-controls="workspace-navigation"
                >
                    <Menu size={20} />
                </button>
                <div className="flex items-center gap-3 text-sm min-w-0">
                    <span className="hidden sm:inline text-zinc-400 capitalize">
                        {role === 'admin' ? 'Administration' : role === 'teacher' ? 'Teaching' : 'Student'}{' '}
                        workspace
                    </span>
                    <ChevronRight size={14} className="hidden sm:block text-zinc-500" />
                    <span className="text-zinc-100 truncate">{title}</span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className="hidden xl:block font-mono text-xs text-zinc-400">{clock} IST</span>
                <ThemeControl />
                <Link
                    to={profile}
                    aria-label="View profile"
                    title={user?.name || 'Profile'}
                    className="icon-button border border-zinc-800"
                >
                    <User size={18} />
                </Link>
            </div>
        </header>
    );
}
