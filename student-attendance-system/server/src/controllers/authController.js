const respondError = require('../utils/respondError');
const Account = require('../models/Account');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { generateToken } = require('../services/jwtService');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the frontend-safe user object returned after login or /me.
 * Never exposes passwordHash, activationTokenHash or faceEmbedding.
 */
const buildUserResponse = async (account) => {
    const base = {
        id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        isActive: account.isActive
    };

    if (account.role === 'teacher' && account.teacherProfileId) {
        const teacher = await Teacher.findById(account.teacherProfileId);
        if (teacher) {
            base.profileId = teacher._id;
            base.subject = teacher.subject;
            base.description = teacher.description;
            base.profilePhoto = teacher.profilePhoto;
        }
    }

    if (account.role === 'student' && account.studentProfileId) {
        const student = await Student.findById(account.studentProfileId).select('-faceEmbedding');
        if (student) {
            base.profileId = student._id;
            base.studentId = student.studentId;
            base.class = student.class;
            base.section = student.section;
            base.profilePhoto = student.profilePhoto;
        }
    }

    return base;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Public — works for all roles (student, teacher, admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const account = await Account.findOne({ email: normalizedEmail }).select('+passwordHash');
        if (!account) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await account.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!account.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is inactive. Please complete activation or contact your administrator.'
            });
        }

        const token = generateToken(account._id);
        const user = await buildUserResponse(account);

        return res.status(200).json({ success: true, token, user });
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// Protected — returns current account info
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
    try {
        const user = await buildUserResponse(req.account);
        return res.status(200).json({ success: true, user });
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/activate
// Public — consume an activation token to activate an account and set password
// ─────────────────────────────────────────────────────────────────────────────
exports.activate = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        // Find account whose activationTokenHash matches SHA-256 of token
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const targetAccount = await Account.findOne({ activationTokenHash: tokenHash })
            .select('+activationTokenHash +activationTokenExpiry +passwordHash');

        if (!targetAccount || targetAccount.isActive) {
            return res.status(400).json({ success: false, message: 'Invalid or expired activation token' });
        }

        if (!targetAccount.verifyActivationToken(token)) {
            return res.status(400).json({ success: false, message: 'Activation token has expired' });
        }

        await targetAccount.setPassword(password);
        targetAccount.consumeActivationToken();
        await targetAccount.save();

        return res.status(200).json({ success: true, message: 'Account activated successfully. You can now log in.' });
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password
// Protected — all roles; uses shared Account credentials
// ─────────────────────────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide current and new password' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const account = await Account.findById(req.accountId).select('+passwordHash');
        const isMatch = await account.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        await account.setPassword(newPassword);

        // If teacher — also keep Teacher.password field in sync (for any legacy path)
        if (account.role === 'teacher' && account.teacherProfileId) {
            const bcrypt = require('bcryptjs');
            const newHash = await bcrypt.hash(newPassword, 12);
            await Teacher.findByIdAndUpdate(account.teacherProfileId, { password: newHash });
        }

        await account.save();

        return res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED — kept to prevent 404 on old frontend calls; redirects to login
// POST /api/auth/register (now disabled for public use)
// ─────────────────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Public registration is disabled. Teacher and Admin accounts are created by an Admin. Use the activation link sent by your administrator.'
    });
};

// GET /api/auth/activation-context?token=<raw>
// Public -- returns ONLY name + role for a valid pending activation token.
// Never exposes password hashes, full account details, or other user records.
exports.getActivationContext = async (req, res) => {
    try {
        const rawToken = req.query.token;
        if (!rawToken) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const account = await Account.findOne({ activationTokenHash: tokenHash })
            .select('+activationTokenHash +activationTokenExpiry');
        if (!account || account.isActive || !account.verifyActivationToken(rawToken)) {
            return res.status(400).json({ success: false, message: 'Invalid or expired activation token' });
        }
        // Only safe non-sensitive fields
        return res.status(200).json({
            success: true,
            context: { name: account.name, role: account.role, email: account.email }
        });
    } catch (error) {
        return respondError(res, error);
    }
};
