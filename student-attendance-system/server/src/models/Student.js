const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    academicYear: { type: Number, min: 1, max: 4, default: 1 },
    branch: { type: String, uppercase: true, default: 'CSE', trim: true },
    subsection: { type: String, uppercase: true, default: 'A1', trim: true },
    accountWasActive: { type: Boolean, select: false },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    studentId: {
        type: String,
        required: [true, 'Student ID is required'],
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    profilePhoto: {
        type: String,
        default: ''
    },
    faceEmbedding: {
        type: [Number],
        default: []
    },
    class: {
        type: String,
        default: ''
    },
    section: {
        type: String,
        default: ''
    },
    registeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

studentSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

studentSchema.index({ academicYear: 1, branch: 1, section: 1, subsection: 1 });
studentSchema.set('toJSON', {
    transform: (doc, data) => {
        data.faceRegistered = Array.isArray(data.faceEmbedding) && data.faceEmbedding.length > 0;
        delete data.faceEmbedding;
        return data;
    }
});
module.exports = mongoose.model('Student', studentSchema);
