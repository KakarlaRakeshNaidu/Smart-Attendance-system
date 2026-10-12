const validateRequest = require('../middleware/validateRequest');
const express = require('express');
const {
    getAllStudents,
    getStudent,
    addStudent,
    updateStudent,
    deleteStudent,
    downloadStudentsCSV,
    registerFace,
    updateProfilePhoto,
    getMyProfile
} = require('../controllers/studentController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { studentUploader } = require('../middleware/uploadMiddleware');

const router = express.Router();
router.use(validateRequest);

router.use(protect);

// Optional upload - continues without error if no file sent
const optionalUpload = (req, res, next) => {
    studentUploader.single('profilePhoto')(req, res, (err) => {
        if (err) return next(err);
        next();
    });
};

// Student self-access (must come before /:id route)
router.get('/me', requireRole('student'), getMyProfile);

// Teacher and Admin: full student directory
router.route('/')
    .get(requireRole('teacher', 'admin'), getAllStudents)
    .post(requireRole('teacher', 'admin'), optionalUpload, addStudent);

router.get('/download/csv', requireRole('teacher', 'admin'), downloadStudentsCSV);

// Single student - teacher/admin only
router.route('/:id')
    .get(requireRole('teacher', 'admin'), getStudent)
    .put(requireRole('teacher', 'admin'), updateStudent)
    .delete(requireRole('teacher', 'admin'), deleteStudent);

// Face management - teacher/admin only
router.post('/:id/register-face', requireRole('teacher', 'admin'), registerFace);
router.put('/:id/profile-photo', requireRole('teacher', 'admin'), updateProfilePhoto);

module.exports = router;
