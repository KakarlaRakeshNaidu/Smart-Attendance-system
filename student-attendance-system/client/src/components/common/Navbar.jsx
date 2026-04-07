import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Search, User } from 'lucide-react';

const Navbar = () => {
    const { teacher, isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated || location.pathname === '/login' || location.pathname === '/register') {
        return null;
    }

    return (
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/80 px-6 py-4 backdrop-blur">
            <div className="flex items-center justify-end gap-4">
                <div className="relative w-full max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search students, classes, attendance..."
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                    />
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200">
                        <User className="h-4 w-4" />
                    </div>
                    <div className="hidden sm:block">
                        <p className="text-sm font-medium text-zinc-100">{teacher?.name || 'Teacher'}</p>
                        <p className="text-xs text-zinc-400">{teacher?.subject || 'Faculty'}</p>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Navbar;