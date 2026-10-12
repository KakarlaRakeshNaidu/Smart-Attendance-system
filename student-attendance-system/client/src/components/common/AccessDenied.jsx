import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/authContextState';

const AccessDenied = () => {
    const { role } = useAuth();

    const homeLink = role === 'teacher' ? '/dashboard'
                   : role === 'admin'   ? '/admin'
                   : role === 'student' ? '/my-attendance'
                   : '/login';

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
            <div className="text-center p-8">
                <div className="flex justify-center mb-6">
                    <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20">
                        <ShieldOff className="h-12 w-12 text-red-400" />
                    </div>
                </div>
                <h1 className="text-3xl font-bold text-white mb-3">Access Denied</h1>
                <p className="text-zinc-400 mb-8 max-w-sm mx-auto">
                    You don't have permission to view this page.
                    Your role ({role || 'unknown'}) does not include this access level.
                </p>
                <Link
                    to={homeLink}
                    className="btn-primary px-6 py-3 inline-flex items-center gap-2"
                >
                    Go to my dashboard
                </Link>
            </div>
        </div>
    );
};

export default AccessDenied;
