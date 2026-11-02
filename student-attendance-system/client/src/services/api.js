import axios from 'axios';
import { readSession, clearSession } from './authStorage';
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 90000,
    headers: { 'Content-Type': 'application/json' }
});
api.interceptors.request.use((config) => {
    const token = readSession('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.data instanceof Blob) {
            try {
                error.response.data = JSON.parse(await error.response.data.text());
                error.message = error.response.data.message || 'Download failed';
            } catch {
                error.message = 'Download failed';
            }
        }
        if (
            error.response?.status === 401 &&
            error.response.data?.code === 'SESSION_INVALID' &&
            error.config?.headers?.Authorization === `Bearer ${readSession('token')}`
        ) {
            clearSession();
            window.dispatchEvent(new Event('auth:expired'));
        }
        return Promise.reject(error);
    }
);
export default api;
