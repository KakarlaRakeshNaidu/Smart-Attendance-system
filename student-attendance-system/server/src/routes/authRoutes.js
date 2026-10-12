const validateRequest = require('../middleware/validateRequest');
const express = require('express');
const { login, getMe, activate, getActivationContext, changePassword, register } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(validateRequest);

// Public
router.post('/login', login);
router.post('/activate', activate);
router.get('/activation-context', getActivationContext);

// Protected ? all roles
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

// Deprecated public registration ? returns 403
router.post('/register', register);

module.exports = router;
