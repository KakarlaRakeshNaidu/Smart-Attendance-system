import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';

import { AuthContext } from './authContextState';
const validUser = user => user && ['student', 'teacher', 'admin'].includes(user.role);

export const AuthProvider = ({ children }) => {
    // Authenticate with the server before rendering protected content.
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const revision = useRef(0);
    const navigate = useNavigate();

    const clearAuth = () => {
        revision.current++;
        authService.logout();
        setUser(null);
    };
    const checkAuth = async () => {
        const requestRevision = ++revision.current;
        try {
            const response = localStorage.getItem('token') ? await authService.getMe() : null;
            if (requestRevision !== revision.current) return;
            if (response?.success && validUser(response.user)) {
                setUser(response.user);
                localStorage.setItem('user', JSON.stringify(response.user));
                localStorage.removeItem('teacher');
            } else { clearAuth(); setLoading(false); }
        } catch {
            if (requestRevision === revision.current) { clearAuth(); setLoading(false); }
        } finally {
            if (requestRevision === revision.current) setLoading(false);
        }
    };
    useEffect(() => {
        const expired = () => { clearAuth(); setLoading(false); navigate('/login', { replace: true }); };
        window.addEventListener('auth:expired', expired);
        checkAuth();
        return () => { revision.current++; window.removeEventListener('auth:expired', expired); };
    }, []);

    const login = async (email, password) => {
        revision.current++;
        const response = await authService.login(email, password);
        if (response.success && validUser(response.user)) {
            setUser(response.user);
            setLoading(false);
            navigate({ teacher: '/dashboard', admin: '/admin', student: '/my-attendance' }[response.user.role], { replace: true });
        }
        return response;
    };
    const logout = () => { clearAuth(); navigate('/login', { replace: true }); };
    const updateUser = updatedUser => {
        if (!validUser(updatedUser)) return;
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
    };
    // Profile responses have a profile ID, not the Account ID or role.
    const updateTeacher = profile => {
        setUser(current => {
            if (current?.role !== 'teacher') return current;
            const updated = { ...current };
            for (const field of ['name', 'email', 'subject', 'description', 'profilePhoto']) {
                if (profile[field] !== undefined) updated[field] = profile[field];
            }
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
        });
    };
    const value = { user, teacher: user?.role === 'teacher' ? user : null, loading, isAuthenticated: !!user,
        role: user?.role || null, login, logout, updateUser, updateTeacher, checkAuth, clearAuth };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export default AuthProvider;
