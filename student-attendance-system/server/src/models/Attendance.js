const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    studentName: {
        type: String,
        required: true
    },
    studentRollNo: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'late'],
        default: 'present'
    },
    markedAt: {
        type: Date,
        default: Date.now
    }
});

const attendanceSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    subject: {
        type: String,
        default: ''
    },
    class: {
        type: String,
        default: ''
    },
    section: {
        type: String,
        default: ''
    },
    records: [attendanceRecordSchema],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicate attendance for same date
attendanceSchema.index({ teacherId: 1, date: 1, class: 1, section: 1 });

attendanceSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);