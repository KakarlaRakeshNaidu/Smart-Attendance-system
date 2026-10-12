import axios from 'axios';
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    timeout: 90000,
    headers: { 'Content-Type': 'application/json' }
});
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
api.interceptors.response.use(response => response, async error => {
    if (error.response?.data instanceof Blob) {
        try {
            error.response.data = JSON.parse(await error.response.data.text());
            error.message = error.response.data.message || 'Download failed';
        } catch { error.message = 'Download failed'; }
    }
    if (error.response?.status === 401 && error.response.data?.code === 'SESSION_INVALID'
        && error.config?.headers?.Authorization === `Bearer ${localStorage.getItem('token')}`) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('teacher');
        window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
});
export default api;
