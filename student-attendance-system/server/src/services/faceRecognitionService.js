const axios = require('axios');
const FACE_API_URL = process.env.FACE_API_URL || 'http://localhost:5001/api';
const client = axios.create({ baseURL: FACE_API_URL, timeout: 75000 });
async function post(endpoint, payload) {
    try {
        const { data } = await client.post(endpoint, payload);
        if (!data || typeof data.success !== 'boolean') return { success: false, message: 'Face service returned an invalid response.', code: 'FACE_MODEL', httpStatus: 502 };
        return data;
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            return { success: false,
                message: error.response.data?.message || 'Face service request failed.',
                code: error.response.data?.code || (status === 401 || status === 403 ? 'FACE_AUTH' : 'FACE_MODEL'),
                httpStatus: status >= 500 || status === 401 || status === 403 ? 503 : 400 };
        }
        const timeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        return { success: false, message: timeout ? 'Face service timed out. Please try again.' : 'Face service is unavailable. Manual attendance remains available.',
            code: timeout ? 'FACE_TIMEOUT' : 'FACE_UNAVAILABLE', httpStatus: 503 };
    }
}
module.exports = {
    addStudent: (studentId, name, image) => post('/add-student', { studentId, name, image }),
    removeStudent: studentId => post('/remove-student', { studentId }),
    recognizeFace: (image, candidateIds) => post('/recognize', { image, ...(candidateIds === undefined ? {} : { candidateIds }) }),
    recognizeMultipleFaces: (image, candidateIds) => post('/recognize-multiple', { image, ...(candidateIds === undefined ? {} : { candidateIds }) }),
    getEmbedding: image => post('/get-embedding', { image }),
    checkHealth: async () => {
        try { const { data } = await client.get('/health', { timeout: 3000 }); return data; }
        catch { return { success: false, message: 'Face service is unavailable. Manual attendance remains available.' }; }
    }
};
