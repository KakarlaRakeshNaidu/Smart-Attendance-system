import api from './api';

const attendanceService = {
    takeAttendance: async (attendanceData) => {
        const response = await api.post('/attendance', attendanceData);
        return response.data;
    },

    getTodayAttendance: async () => {
        const response = await api.get('/attendance/today');
        return response.data;
    },

    getAllAttendance: async () => {
        const response = await api.get('/attendance');
        return response.data;
    },

    getAttendanceByDate: async (date) => {
        const response = await api.get(`/attendance/date/${date}`);
        return response.data;
    },

    downloadTodayAttendanceCSV: async () => {
        const response = await api.get('/attendance/download/today', {
            responseType: 'blob'
        });
        return response.data;
    },

    downloadAttendanceCSV: async (date) => {
        const response = await api.get(`/attendance/download/${date}`, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Face Recognition Attendance
    takeFaceAttendance: async (imageBase64) => {
        const response = await api.post('/attendance/face', {
            image: imageBase64
        });
        return response.data;
    },

    takeMultipleFaceAttendance: async (imageBase64) => {
        const response = await api.post('/attendance/face-multiple', {
            image: imageBase64
        });
        return response.data;
    },

    checkFaceApiStatus: async () => {
        const response = await api.get('/attendance/face-status');
        return response.data;
    },

    resetTodayAttendance: async () => {
        const response = await api.delete('/attendance/today');
        return response.data;
    }
};

export default attendanceService;