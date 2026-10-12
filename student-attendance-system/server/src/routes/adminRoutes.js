const validateRequest = require('../middleware/validateRequest');
const express = require('express');
const {
    listAccounts,
    setAccountStatus,
    onboardTeacher,
    onboardStudent,
    getAccount
} = require('../controllers/adminController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(validateRequest);

// All admin routes require authentication and admin role
router.use(protect, requireRole('admin'));

router.get('/accounts', listAccounts);
router.get('/accounts/:accountId', getAccount);
router.patch('/accounts/:accountId/status', setAccountStatus);
router.post('/onboard-teacher', onboardTeacher);
router.post('/onboard-student', onboardStudent);

module.exports = router;
