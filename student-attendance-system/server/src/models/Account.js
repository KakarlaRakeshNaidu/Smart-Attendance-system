const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const accountSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true
        },
        passwordHash: {
            type: String,
            required: [true, 'Password is required'],
            select: false
        },
        role: {
            type: String,
            enum: ['student', 'teacher', 'admin'],
            required: [true, 'Role is required']
        },
        isActive: {
            type: Boolean,
            default: false
        },
        teacherProfileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teacher'
        },
        studentProfileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student'
        },
        activationTokenHash: {
            type: String,
            select: false
        },
        activationTokenExpiry: {
            type: Date,
            select: false
        }
    },
    { timestamps: true }
);

accountSchema.index({ teacherProfileId: 1 }, { unique: true, sparse: true, name: 'unique_teacher_profile' });
accountSchema.index({ studentProfileId: 1 }, { unique: true, sparse: true, name: 'unique_student_profile' });

accountSchema.methods.setPassword = async function (plainText) {
    this.passwordHash = await bcrypt.hash(plainText, 12);
};

accountSchema.methods.setRawHash = function (existingHash) {
    this.passwordHash = existingHash;
};

accountSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

accountSchema.methods.generateActivationToken = function (ttlMinutes = 4320) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.activationTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.activationTokenExpiry = new Date(Date.now() + ttlMinutes * 60 * 1000);
    return rawToken;
};

accountSchema.methods.verifyActivationToken = function (rawToken) {
    if (!this.activationTokenHash || !this.activationTokenExpiry) return false;
    if (this.activationTokenExpiry < new Date()) return false;
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return hash === this.activationTokenHash;
};

accountSchema.methods.consumeActivationToken = function () {
    this.isActive = true;
    this.activationTokenHash = undefined;
    this.activationTokenExpiry = undefined;
};

accountSchema.methods.toPublicJSON = function () {
    return {
        id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        isActive: this.isActive,
        activationPending: !this.isActive && Boolean(this.activationTokenHash),
        teacherProfileId: this.teacherProfileId,
        studentProfileId: this.studentProfileId,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('Account', accountSchema);
