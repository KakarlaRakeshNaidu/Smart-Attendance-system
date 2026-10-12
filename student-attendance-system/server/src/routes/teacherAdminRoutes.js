const validateRequest = require('../middleware/validateRequest');
const express = require('express');
const { onboardStudent } = require('../controllers/adminController');
const { protect, requireRole, requireTeacherProfile } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(validateRequest);

// Teachers can initiate student account onboarding
router.use(protect, requireRole('teacher'), requireTeacherProfile);
router.post('/onboard-student', onboardStudent);

module.exports = router;
