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

const P = require('../controllers/adminPortalController');
router.get('/overview', P.overview);
router.get('/directories/:kind', P.directory);
router.get('/directories/:kind/:id', P.profile);
router.get('/attendance', P.attendance);
router.get('/accounts', P.accounts);
router.get('/accounts/:accountId', P.account);
router.patch('/accounts/:accountId/status', setAccountStatus);
router.post('/accounts/:accountId/invitation', require('../controllers/adminController').reissueInvitation);
router.post('/onboard-teacher', onboardTeacher);
router.post('/onboard-student', onboardStudent);

module.exports = router;
