import api from './api';

const studentService = {
    getAllStudents: async () => {
        const response = await api.get('/students');
        return response.data;
    },

    getStudent: async (id) => {
        const response = await api.get(`/students/${id}`);
        return response.data;
    },

    addStudent: async (studentData) => {
        // If we have both profilePhoto file AND faceImage, use FormData
        // If we only have faceImage (base64), use JSON
        // If we only have profilePhoto file, use FormData
        
        const hasProfilePhotoFile = studentData.profilePhoto && studentData.profilePhoto instanceof File;
        const hasFaceImage = !!studentData.faceImage;
        
        if (hasProfilePhotoFile && !hasFaceImage) {
            // Use FormData for file upload only
            const formData = new FormData();
            if (studentData.studentId) formData.append('studentId', studentData.studentId);
            if (studentData.name) formData.append('name', studentData.name);
            if (studentData.email) formData.append('email', studentData.email);
            if (studentData.class) formData.append('class', studentData.class);
            if (studentData.section) formData.append('section', studentData.section);
            formData.append('profilePhoto', studentData.profilePhoto);
            
            const response = await api.post('/students', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return response.data;
        }
        
        // Use JSON for faceImage (base64 is too large for FormData text fields)
        const jsonData = {
            studentId: studentData.studentId,
            name: studentData.name,
            email: studentData.email || '',
            class: studentData.class || '',
            section: studentData.section || ''
        };
        
        if (hasFaceImage) {
            jsonData.faceImage = studentData.faceImage;
        }
        
        const response = await api.post('/students', jsonData, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    },

    updateStudent: async (id, studentData) => {
        const response = await api.put(`/students/${id}`, studentData);
        return response.data;
    },

    deleteStudent: async (id) => {
        const response = await api.delete(`/students/${id}`);
        return response.data;
    },

    registerFace: async (id, faceImage) => {
        const response = await api.post(`/students/${id}/register-face`, { faceImage });
        return response.data;
    },

    updateProfilePhoto: async (id, faceImage) => {
        const response = await api.put(`/students/${id}/profile-photo`, { faceImage });
        return response.data;
    },

    downloadStudentsCSV: async () => {
        const response = await api.get('/students/download/csv', {
            responseType: 'blob'
        });
        return response.data;
    }
};

export default studentService;