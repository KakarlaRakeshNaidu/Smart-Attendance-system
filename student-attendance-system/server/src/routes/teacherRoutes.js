const validateRequest = require('../middleware/validateRequest');
const express = require('express');
const {
    getProfile,
    updateProfile,
    uploadProfilePhoto
} = require('../controllers/teacherController');
const { protect, requireRole, requireTeacherProfile } = require('../middleware/authMiddleware');
const { teacherUploader } = require('../middleware/uploadMiddleware');

const router = express.Router();
router.use(validateRequest);

// All teacher routes require teacher role AND a linked teacher profile
router.use(protect, requireRole('teacher'), requireTeacherProfile);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/profile/photo', teacherUploader.single('profilePhoto'), uploadProfilePhoto);

// Password change now lives in /api/auth/change-password (all roles)
// Keep old route pointing there for any lingering frontend calls
router.put('/change-password', (req, res) => {
    res.status(301).json({
        success: false,
        message: 'Password change has moved to PUT /api/auth/change-password'
    });
});

module.exports = router;
