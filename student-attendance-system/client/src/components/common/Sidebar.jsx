import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard,
    Users,
    ClipboardCheck,
    User,
    Settings,
    LogOut,
    GraduationCap,
    X
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose }) => {
    const { isAuthenticated, logout } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return null;
    }

    const links = [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/students', label: 'Students', icon: Users },
        { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
        { to: '/profile', label: 'Profile', icon: User }
    ];

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

    const handleLinkClick = () => {
        // Close sidebar drawer on mobile when a link is clicked
        if (onClose) onClose();
    };

    return (
        <>
            {/* Mobile overlay backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-40 w-72 border-r border-zinc-800 bg-zinc-950 px-4 py-6
                    transform transition-transform duration-300 ease-in-out
                    lg:translate-x-0
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                <div className="flex h-full flex-col">
                    {/* Header with logo and mobile close button */}
                    <div className="mb-8 flex items-center justify-between">
                        <Link
                            to="/dashboard"
                            onClick={handleLinkClick}
                            className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex-1"
                        >
                            <div className="rounded-xl bg-white p-2 text-black flex-shrink-0">
                                <GraduationCap className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-400">Attendance</p>
                                <p className="font-semibold text-white">Attendance System</p>
                            </div>
                        </Link>

                        {/* Close button — only visible on mobile */}
                        <button
                            onClick={onClose}
                            className="ml-2 flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-white lg:hidden"
                            aria-label="Close sidebar"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <nav className="space-y-2">
                        {links.map((link) => {
                            const Icon = link.icon;
                            const active = isActive(link.to);
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    onClick={handleLinkClick}
                                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                                        active
                                            ? 'border-zinc-700 bg-zinc-800 text-white'
                                            : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-auto space-y-2 border-t border-zinc-800 pt-4">
                        <Link
                            to="/change-password"
                            onClick={handleLinkClick}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                                isActive('/change-password')
                                    ? 'border-zinc-700 bg-zinc-800 text-white'
                                    : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100'
                            }`}
                        >
                            <Settings className="h-4 w-4" />
                            Settings
                        </Link>
                        <button
                            onClick={() => { logout(); handleLinkClick(); }}
                            className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-left text-sm font-medium text-zinc-400 transition-all duration-200 hover:border-zinc-800 hover:bg-zinc-900 hover:text-red-400"
                        >
                            <LogOut className="h-4 w-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;