const { body, validationResult } = require('express-validator');

const validateTeacherLogin = [
    body('email').isEmail().withMessage('Please enter a valid email address.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
];

const validateChangePassword = [
    body('oldPassword').isLength({ min: 6 }).withMessage('Old password must be at least 6 characters long.'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long.'),
];

const validateStudentData = [
    body('name').notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Please enter a valid email address.'),
    body('grade').notEmpty().withMessage('Grade is required.'),
];

const validateAttendanceData = [
    body('studentId').notEmpty().withMessage('Student ID is required.'),
    body('status').isIn(['present', 'absent']).withMessage('Status must be either present or absent.'),
];

const validateProfileUpdate = [
    body('description').optional().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters.'),
    body('subject').optional().notEmpty().withMessage('Subject cannot be empty.'),
];

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

module.exports = {
    validateTeacherLogin,
    validateChangePassword,
    validateStudentData,
    validateAttendanceData,
    validateProfileUpdate,
    validateRequest,
};