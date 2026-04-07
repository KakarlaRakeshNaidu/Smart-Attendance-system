const Teacher = require('../models/Teacher');
const { generateToken } = require('../services/jwtService');

// @desc    Register teacher
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, password, subject } = req.body;

        // Check if teacher exists
        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }

        // Create teacher
        const teacher = await Teacher.create({
            name,
            email,
            password,
            subject: subject || ''
        });

        // Generate token
        const token = generateToken(teacher._id);

        res.status(201).json({
            success: true,
            token,
            teacher: {
                id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                subject: teacher.subject,
                description: teacher.description,
                profilePhoto: teacher.profilePhoto
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};

// @desc    Login teacher
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide email and password' 
            });
        }

        // Find teacher with password
        const teacher = await Teacher.findOne({ email }).select('+password');
        if (!teacher) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Check password
        const isMatch = await teacher.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Generate token
        const token = generateToken(teacher._id);

        res.status(200).json({
            success: true,
            token,
            teacher: {
                id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                subject: teacher.subject,
                description: teacher.description,
                profilePhoto: teacher.profilePhoto
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};

// @desc    Get logged in teacher
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const teacher = await Teacher.findById(req.teacherId);
        
        res.status(200).json({
            success: true,
            teacher: {
                id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                subject: teacher.subject,
                description: teacher.description,
                profilePhoto: teacher.profilePhoto
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};