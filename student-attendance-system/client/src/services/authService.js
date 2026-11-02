import api from './api';
import { readSession, writeSession, clearSession } from './authStorage';

const authService = {
    login: async (email, password, remember = true) => {
        const response = await api.post('/auth/login', { email, password });
        if (response.data.token) {
            writeSession(response.data.token, response.data.user, remember);
        }
        return response.data;
    },

    logout: () => {
        clearSession();
    },

    getMe: async () => {
        const response = await api.get('/auth/me', { timeout: 15000 });
        return response.data;
    },

    changePassword: async (currentPassword, newPassword) => {
        const response = await api.put('/auth/change-password', { currentPassword, newPassword });
        return response.data;
    },

    activate: async (token, password) => {
        const response = await api.post('/auth/activate', { token, password });
        return response.data;
    },

    getCurrentUser: () => {
        try {
            const u = readSession('user');
            return u ? JSON.parse(u) : null;
        } catch {
            return null;
        }
    },

    isAuthenticated: () => !!readSession('token'),
    getActivationContext: async (token) => {
        const response = await api.get(`/auth/activation-context?token=${encodeURIComponent(token)}`);
        return response.data;
    }
};

export default authService;
