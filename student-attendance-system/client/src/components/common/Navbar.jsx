import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Search, User, Menu } from 'lucide-react';

const Navbar = ({ onMenuToggle }) => {
    const { teacher, isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated || location.pathname === '/login' || location.pathname === '/register') {
        return null;
    }

    return (
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
            <div className="flex items-center gap-3 sm:gap-4">
                {/* Hamburger button — only on mobile/tablet */}
                <button
                    onClick={onMenuToggle}
                    className="flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-white lg:hidden"
                    aria-label="Open menu"
                    id="sidebar-menu-btn"
                >
                    <Menu className="h-5 w-5" />
                </button>

                {/* Search bar */}
                <div className="relative flex-1 max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
                    />
                </div>

                {/* User avatar */}
                <div className="flex flex-shrink-0 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2">
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