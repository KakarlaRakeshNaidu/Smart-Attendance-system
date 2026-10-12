const respondError = require('../utils/respondError');
const Account = require('../models/Account');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { generateToken } = require('../services/jwtService');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns whether DEVELOPMENT activation handoff is enabled.
 * Set ENABLE_DEV_ACTIVATION=true in .env to expose raw tokens in responses.
 * Production: leave unset.  Tokens must be delivered out-of-band.
 */
const devModeActive = () => process.env.ENABLE_DEV_ACTIVATION === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/accounts
// Admin only — list all accounts
// ─────────────────────────────────────────────────────────────────────────────
exports.listAccounts = async (req, res) => {
    try {
        const [accounts, studentCount] = await Promise.all([
            Account.find().select('+activationTokenHash').sort({ createdAt: -1 }),
            Student.countDocuments({})
        ]);
        const safe = accounts.map(a => a.toPublicJSON());
        return res.status(200).json({ success: true, accounts: safe, count: safe.length, studentCount });
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/accounts/:accountId/status
// Admin only — activate or deactivate an account
// Cannot deactivate your own account or change other admins via browser UI
// ─────────────────────────────────────────────────────────────────────────────
exports.setAccountStatus = async (req, res) => {
    try {
        const { accountId } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
        }

        if (accountId === String(req.accountId)) {
            return res.status(400).json({ success: false, message: 'You cannot change your own account status' });
        }

        const account = await Account.findById(accountId).select('+activationTokenHash');
        if (!account) {
            return res.status(404).json({ success: false, message: 'Account not found' });
        }

        // Admins cannot deactivate other admin accounts via browser UI in this upgrade
        if (account.role === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin account status can only be changed via the CLI setup tool'
            });
        }

        if (isActive && account.activationTokenHash) return res.status(409).json({ success: false, message: 'The account holder must complete password activation first.' });
        account.isActive = isActive;
        await account.save();

        return res.status(200).json({
            success: true,
            message: `Account ${isActive ? 'activated' : 'deactivated'} successfully`,
            account: account.toPublicJSON()
        });
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/onboard-teacher
// Admin only — create a Teacher profile + Account and issue activation token
// ─────────────────────────────────────────────────────────────────────────────
exports.onboardTeacher = async (req, res) => {
    try {
        const { name, email, subject } = req.body;

        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Name and email are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check for existing account with this email
        const existingAccount = await Account.findOne({ email: normalizedEmail }).select('+activationTokenHash');
        if (existingAccount) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists' });
        }

        // Check for existing Teacher profile with this email
        const existingTeacher = await Teacher.findOne({ email: normalizedEmail });
        if (existingTeacher) {
            const linked = await Account.findOne({ teacherProfileId: existingTeacher._id });
            if (linked) {
                return res.status(409).json({ success: false, message: 'This teacher already has an account' });
            }
        }

        // Create Teacher profile
        let teacher = existingTeacher;
        if (!teacher) {
            teacher = await Teacher.create({
                name,
                email: normalizedEmail,
                password: require('crypto').randomBytes(32).toString('hex'), // placeholder, replaced by Account
                subject: subject || ''
            });
        }

        // Create Account with a placeholder hash; real password set on activation
        const account = new Account({
            name,
            email: normalizedEmail,
            role: 'teacher',
            isActive: false,
            teacherProfileId: teacher._id
        });
        await account.setPassword(require('crypto').randomBytes(32).toString('hex')); // random placeholder

        const rawToken = account.generateActivationToken(4320); // 72 hours
        await account.save();

        const response = {
            success: true,
            message: 'Teacher account created. Share the activation link.',
            account: account.toPublicJSON()
        };

        if (devModeActive()) {
            response._devOnly_activationToken = rawToken;
            response._devOnly_note = 'Remove ENABLE_DEV_ACTIVATION from .env in production';
        } else {
            response.note = 'Set ENABLE_DEV_ACTIVATION=true in .env to see the activation token during development. In production, configure email delivery.';
        }

        return res.status(201).json(response);
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/onboard-student  (also accessible by teacher — see route)
// Teacher or Admin — initiate student account activation
// The student record must already exist
// ─────────────────────────────────────────────────────────────────────────────
exports.onboardStudent = async (req, res) => {
    try {
        const { studentProfileId } = req.body;

        if (!studentProfileId) {
            return res.status(400).json({ success: false, message: 'studentProfileId is required' });
        }

        const student = await Student.findById(studentProfileId).select('-faceEmbedding');
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student record not found' });
        }

        if (!student.email) {
            return res.status(400).json({
                success: false,
                message: 'Student has no email address. Add an email to the student record before initiating onboarding.'
            });
        }

        const normalizedEmail = student.email.toLowerCase().trim();

        // Check if account already exists
        let account = await Account.findOne({ email: normalizedEmail }).select('+activationTokenHash');
        if (account) {
            if (account.role !== 'student' || String(account.studentProfileId) !== String(student._id)) {
                return res.status(409).json({ success: false, message: 'Email belongs to another account or profile.' });
            }
            if (!account.isActive && !account.activationTokenHash) {
                return res.status(403).json({ success: false, message: 'Account disabled. Contact your administrator.' });
            }
            if (account.isActive) {
                return res.status(409).json({ success: false, message: 'Student already has an active account' });
            }
            // Reissue activation token
        } else {
            // Check no other student profile linked
            const existing = await Account.findOne({ studentProfileId: student._id });
            if (existing) {
                return res.status(409).json({ success: false, message: 'Student already has an account linked' });
            }

            account = new Account({
                name: student.name,
                email: normalizedEmail,
                role: 'student',
                isActive: false,
                studentProfileId: student._id
            });
            await account.setPassword(require('crypto').randomBytes(32).toString('hex'));
        }

        const rawToken = account.generateActivationToken(4320);
        await account.save();

        const response = {
            success: true,
            message: 'Student account created. Share the activation link.',
            account: account.toPublicJSON()
        };

        if (devModeActive()) {
            response._devOnly_activationToken = rawToken;
            response._devOnly_note = 'Remove ENABLE_DEV_ACTIVATION from .env in production';
        } else {
            response.note = 'Set ENABLE_DEV_ACTIVATION=true in .env to see the activation token during development.';
        }

        return res.status(201).json(response);
    } catch (error) {
        return respondError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/accounts/:accountId
// Admin only — get single account details
// ─────────────────────────────────────────────────────────────────────────────
exports.getAccount = async (req, res) => {
    try {
        const account = await Account.findById(req.params.accountId).select('+activationTokenHash');
        if (!account) {
            return res.status(404).json({ success: false, message: 'Account not found' });
        }
        return res.status(200).json({ success: true, account: account.toPublicJSON() });
    } catch (error) {
        return respondError(res, error);
    }
};
