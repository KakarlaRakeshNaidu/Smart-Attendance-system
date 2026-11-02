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
    .post(requireRole('teacher', 'admin'), optionalUpload, async (req, res) => {
        req.params.kind = 'students';
        if (req.body.academicYear || req.body.branch || req.body.password) {
            if (req.userRole === 'teacher') { try { const D = require('../services/administrationService'); await D.access(req, D.accessFields(req.body)); } catch (error) { return require('../utils/respondError')(res,error); } }
            return require('../controllers/directoryController').create(req,res);
        }
        return addStudent(req,res);
    });

router.use('/:id', async (req, res, next) => {
    try {
        if (req.params.id === 'download') return next();
        if (req.userRole === 'teacher') {
            const scope = await require('../services/administrationService').studentFilter(req);
            if (!await require('../models/Student').exists({ $and: [{ _id: req.params.id }, scope] })) return res.status(403).json({ success: false, message: 'Student is outside your assigned scope.' });
        }
        next();
    } catch (error) { return require('../utils/respondError')(res, error); }
});

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
