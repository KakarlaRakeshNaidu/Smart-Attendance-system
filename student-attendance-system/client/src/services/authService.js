import api from './api';

const authService = {
    login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('teacher'); // legacy cleanup
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
            const u = localStorage.getItem('user');
            return u ? JSON.parse(u) : null;
        } catch { return null; }
    },

    isAuthenticated: () => !!localStorage.getItem('token'),
    getActivationContext: async (token) => {
        const response = await api.get(`/auth/activation-context?token=${encodeURIComponent(token)}`);
        return response.data;
    },

};

export default authService;
