import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [teacher, setTeacher] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                const response = await authService.getMe();
                if (response.success) {
                    setTeacher(response.teacher);
                }
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('teacher');
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        const response = await authService.login(email, password);
        if (response.success) {
            setTeacher(response.teacher);
            navigate('/dashboard');
        }
        return response;
    };

    const register = async (userData) => {
        const response = await authService.register(userData);
        if (response.success) {
            setTeacher(response.teacher);
            navigate('/dashboard');
        }
        return response;
    };

    const logout = () => {
        authService.logout();
        setTeacher(null);
        navigate('/login');
    };

    const updateTeacher = (updatedTeacher) => {
        setTeacher(updatedTeacher);
        localStorage.setItem('teacher', JSON.stringify(updatedTeacher));
    };

    const value = {
        teacher,
        loading,
        isAuthenticated: !!teacher,
        login,
        register,
        logout,
        updateTeacher,
        checkAuth
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;