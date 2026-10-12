const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const Account = require('../models/Account');
const Teacher = require('../models/Teacher');

const verifyJwt = promisify(jwt.verify);

/**
 * protect — authenticate any account.
 *
 * Sets on req:
 *   req.account     — full Account document (no passwordHash)
 *   req.accountId   — account._id
 *   req.userRole    — account.role ('student'|'teacher'|'admin')
 *
 * For teacher-role accounts additionally sets:
 *   req.teacher     — Teacher profile document
 *   req.teacherId   — teacher._id
 *
 * Old-token handling: tokens issued before RBAC contain only { id } with
 * no matching Account row.  Those tokens will receive 401 with a message
 * instructing the user to log in again.
 */
const protect = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                code: 'SESSION_INVALID',
                message: 'Not authorised. No token provided.'
            });
        }

        let decoded;
        try {
            decoded = await verifyJwt(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                code: 'SESSION_INVALID',
                message: 'Token is not valid or has expired.'
            });
        }

        if (!require('mongoose').isObjectIdOrHexString(decoded.id)) {
            return res.status(401).json({ success: false, code: 'SESSION_INVALID', message: 'Session is invalid. Please log in again.' });
        }
        // Find account by the id stored in the token
        const account = await Account.findById(decoded.id).select('-passwordHash');

        if (!account) {
            // Token was issued before RBAC migration — requires fresh login
            return res.status(401).json({
                success: false,
                code: 'SESSION_INVALID',
                message: 'Session expired after system upgrade. Please log in again.'
            });
        }

        if (!account.isActive) {
            return res.status(401).json({
                success: false,
                code: 'SESSION_INVALID',
                message: 'Account is inactive. Contact your administrator.'
            });
        }

        // Attach account to request
        req.account = account;
        req.accountId = account._id;
        req.userRole = account.role;

        // For teacher accounts — also load the Teacher profile so existing
        // controllers that use req.teacher / req.teacherId keep working.
        if (account.role === 'teacher' && account.teacherProfileId) {
            const teacher = await Teacher.findById(account.teacherProfileId);
            if (teacher) {
                req.teacher = teacher;
                req.teacherId = teacher._id;
            }
        }

        next();
    } catch (error) {
        return res.status(503).json({
            success: false,
            message: 'Authentication service unavailable. Please try again.'
        });
    }
};

/**
 * requireRole(...roles) — authorize by role.
 * Must be used AFTER protect.
 *
 * Usage:
 *   router.get('/admin-only', protect, requireRole('admin'), handler)
 *   router.get('/staff',      protect, requireRole('teacher','admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
        return res.status(403).json({
            success: false,
                code: 'FORBIDDEN',
            message: `Access denied. Required role: ${roles.join(' or ')}.`
        });
    }
    next();
};

/**
 * requireTeacherProfile — for routes that need req.teacher to be populated.
 * A teacher account without a linked profile should not reach these routes.
 */
const requireTeacherProfile = (req, res, next) => {
    if (!req.teacher || !req.teacherId) {
        return res.status(403).json({
            success: false,
                code: 'SESSION_INVALID',
            message: 'Teacher profile not found for this account.'
        });
    }
    next();
};

module.exports = { protect, requireRole, requireTeacherProfile };
