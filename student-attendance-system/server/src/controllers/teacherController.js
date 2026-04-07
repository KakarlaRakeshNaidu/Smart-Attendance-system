const Teacher = require('../models/Teacher');
const path = require('path');
const fs = require('fs');

// @desc    Get teacher profile
// @route   GET /api/teacher/profile
// @access  Private
exports.getProfile = async (req, res) => {
    try {
        const teacher = await Teacher.findById(req.teacherId);

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found'
            });
        }

        res.status(200).json({
            success: true,
            teacher: {
                id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                subject: teacher.subject,
                description: teacher.description,
                profilePhoto: teacher.profilePhoto,
                createdAt: teacher.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            error: error.message
        });
    }
};

// @desc    Update teacher profile
// @route   PUT /api/teacher/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, subject, description } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (subject !== undefined) updateData.subject = subject;
        if (description !== undefined) updateData.description = description;

        const teacher = await Teacher.findByIdAndUpdate(
            req.teacherId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: 'Teacher not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
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
            message: 'Error updating profile',
            error: error.message
        });
    }
};

// @desc    Upload profile photo
// @route   POST /api/teacher/profile/photo
// @access  Private
exports.uploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file'
            });
        }

        const teacher = await Teacher.findById(req.teacherId);

        // Delete old profile photo if exists
        if (teacher.profilePhoto) {
            const oldPhotoPath = path.join(__dirname, '../../', teacher.profilePhoto);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        // Build the stored path from the file's actual location
        const relativePath = req.file.path
            .replace(/\\/g, '/')
            .split('uploads/')[1];
        const photoPath = `/uploads/${relativePath}`;

        teacher.profilePhoto = photoPath;
        await teacher.save();

        res.status(200).json({
            success: true,
            message: 'Profile photo uploaded successfully',
            profilePhoto: photoPath
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error uploading photo',
            error: error.message
        });
    }
};

// @desc    Change password
// @route   PUT /api/teacher/change-password
// @access  Private
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current and new password'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }

        const teacher = await Teacher.findById(req.teacherId).select('+password');

        const isMatch = await teacher.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        teacher.password = newPassword;
        await teacher.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error changing password',
            error: error.message
        });
    }
};