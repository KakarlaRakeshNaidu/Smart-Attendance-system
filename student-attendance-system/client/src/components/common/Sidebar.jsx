import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    ClipboardCheck,
    GraduationCap,
    BarChart3,
    ShieldCheck,
    UserCheck,
    CalendarDays,
    BookOpen,
    FileText,
    History,
    Settings,
    User,
    LogOut,
    X
} from 'lucide-react';
import { useAuth } from '../../context/authContextState';
import { NotificationLink } from '../Notifications/notificationState';
const entry = (to, label, icon) => ({ to, label, icon });
const groups = {
    admin: [
        {
            label: 'Workspace',
            items: [
                entry('/admin/dashboard', 'Overview', LayoutDashboard),
                entry('/admin/attendance', 'Attendance', ClipboardCheck),
                entry('/attendance-analytics', 'Analytics', BarChart3)
            ]
        },
        {
            label: 'People',
            items: [
                entry('/admin/students', 'Students', Users),
                entry('/admin/teachers', 'Teachers', UserCheck),
                entry('/admin/accounts', 'Accounts & activation', ShieldCheck)
            ]
        },
        {
            label: 'Academics',
            items: [
                entry('/admin/classes', 'Classes', GraduationCap),
                entry('/admin/subjects', 'Subjects', BookOpen),
                entry('/admin/enrollments', 'Enrollments', Users),
                entry('/admin/assignments', 'Teacher assignments', CalendarDays),
                entry('/academic', 'Academic management', BookOpen)
            ]
        },
        {
            label: 'Records',
            items: [
                entry('/attendance-corrections', 'Corrections', ClipboardCheck),
                entry('/semester-reports', 'Semester reports', FileText),
                entry('/legacy-attendance', 'Legacy attendance', History),
                entry('/admin/audit-logs', 'Audit logs', ShieldCheck)
            ]
        }
    ],
    teacher: [
        {
            label: 'Workspace',
            items: [
                entry('/dashboard', 'Overview', LayoutDashboard),
                entry('/attendance', 'Batch attendance', ClipboardCheck),
                entry('/lecture-attendance', 'Lecture attendance', CalendarDays),
                entry('/students', 'Student directory', Users)
            ]
        },
        {
            label: 'Teaching',
            items: [
                entry('/academic', 'Courses & lectures', BookOpen),
                entry('/attendance-analytics', 'Analytics', BarChart3),
                entry('/attendance-corrections', 'Corrections', ClipboardCheck)
            ]
        },
        {
            label: 'Records',
            items: [
                entry('/semester-reports', 'Semester reports', FileText),
                entry('/legacy-attendance', 'Legacy attendance', History)
            ]
        }
    ],
    student: [
        {
            label: 'Workspace',
            items: [
                entry('/student/dashboard', 'Overview', LayoutDashboard),
                entry('/student/attendance', 'My attendance', ClipboardCheck),
                entry('/academic', 'Courses & lectures', BookOpen)
            ]
        },
        {
            label: 'Records',
            items: [
                entry('/student/reports', 'Attendance report', BarChart3),
                entry('/my-attendance/history', 'Attendance history', History),
                entry('/attendance-analytics', 'Analytics', BarChart3),
                entry('/attendance-corrections', 'Corrections', ClipboardCheck),
                entry('/semester-reports', 'Semester reports', FileText),
                entry('/legacy-attendance', 'Legacy attendance', History)
            ]
        }
    ]
};
export default function Sidebar({ isOpen, onClose }) {
    const { user, role, logout, isAuthenticated } = useAuth(),
        location = useLocation(),
        panel = useRef(null);
    const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width:1024px)').matches);
    useEffect(() => {
        const query = window.matchMedia('(min-width:1024px)'),
            change = () => setDesktop(query.matches);
        query.addEventListener('change', change);
        return () => query.removeEventListener('change', change);
    }, []);
    useEffect(() => {
        if (panel.current) panel.current.inert = !desktop && !isOpen;
    }, [desktop, isOpen]);
    useEffect(() => {
        if (!isOpen || desktop) return;
        const previous = document.activeElement,
            overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const node = panel.current;
        node.querySelector('a,button')?.focus();
        const key = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Tab') {
                const items = [...node.querySelectorAll('a,button,select')].filter(
                        (el) => el.getClientRects().length
                    ),
                    first = items[0],
                    last = items.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', key);
        return () => {
            document.body.style.overflow = overflow;
            document.removeEventListener('keydown', key);
            if (previous?.isConnected) previous.focus();
        };
    }, [isOpen, desktop, onClose]);
    if (!isAuthenticated) return null;
    const home =
        role === 'admin' ? '/admin/dashboard' : role === 'student' ? '/student/dashboard' : '/dashboard';
    const profile =
        role === 'admin' ? '/admin/profile' : role === 'student' ? '/student/profile' : '/profile';
    return (
        <>
            {isOpen && !desktop && (
                <button
                    className="fixed inset-0 z-40 bg-black/50"
                    aria-label="Close navigation overlay"
                    onClick={onClose}
                />
            )}
            <aside
                id="workspace-navigation"
                ref={panel}
                className={'app-sidebar ' + (isOpen ? 'is-open' : '')}
                aria-label="Workspace navigation"
                aria-hidden={!desktop && !isOpen}
            >
                <div className="flex items-center justify-between gap-2">
                    <Link to={home} onClick={onClose} className="flex items-center gap-3 px-2 text-zinc-100">
                        <GraduationCap size={24} className="text-primary" />
                        <span>
                            <span className="block text-base font-medium leading-5">Smart Attendance</span>
                            <span className="block text-xs text-zinc-400 mt-1">Campus register</span>
                        </span>
                    </Link>
                    <button onClick={onClose} className="icon-button lg:hidden" aria-label="Close sidebar">
                        <X size={18} />
                    </button>
                </div>
                <nav aria-label="Primary navigation" className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                    {(groups[role] || []).map((group, index) => (
                        <div key={group.label}>
                            <p className={'sidebar-group-label ' + (!index ? '!mt-0' : '')}>{group.label}</p>
                            <div className="space-y-1">
                                {group.items.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={item.to === home}
                                        onClick={onClose}
                                        className="sidebar-link"
                                    >
                                        <item.icon size={16} />
                                        <span>{item.label}</span>
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                    {role !== 'admin' && (
                        <div className="mt-5">
                            <NotificationLink className="sidebar-link" onClick={onClose} />
                        </div>
                    )}
                </nav>
                <div className="border-t border-zinc-800 pt-3 space-y-1">
                    <Link to={profile} onClick={onClose} className="sidebar-link">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 font-medium">
                            {user?.name?.charAt(0) || 'A'}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-zinc-100">{user?.name || 'My profile'}</span>
                            <span className="block text-xs capitalize">
                                {role === 'admin' ? 'Administrator' : role}
                            </span>
                        </span>
                    </Link>
                    <div className="flex gap-1">
                        <Link to="/change-password" onClick={onClose} className="sidebar-link flex-1">
                            <Settings size={16} />
                            Settings
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                logout();
                                onClose();
                            }}
                            className="icon-button"
                            aria-label="Sign out"
                            title="Sign out"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
