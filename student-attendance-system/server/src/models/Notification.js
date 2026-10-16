const { Schema, model } = require('mongoose');
const ref = name => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const notification = new Schema({
    recipientId: ref('Account'), type: { type: String, enum: ['low-attendance'], default: 'low-attendance' },
    recipientRole: { type: String, enum: ['student', 'teacher'], required: true },
    studentId: ref('Student'), offeringId: ref('CourseOffering'), termId: ref('AcademicTerm'),
    // Student scope is the whole offering. Teacher scope is only their taught lectures.
    scope: { type: String, required: true }, teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    attended: Number, eligible: Number, present: Number, late: Number, absent: Number,
    percentage: { type: Number, default: null }, minimum: Number,
    evaluatedAt: Date, snapshotAt: Date, evaluationVersion: { type: Number, required: true },
    // Dormant rows contain only reconciliation metadata, never a delivered notification.
    // They fence late first-insert attempts even when a newer evaluation needed no alert.
    hasAlert: { type: Boolean, default: true }, firstAlertAt: Date,
    status: { type: String, enum: ['active', 'resolved', 'unavailable', 'dormant'], required: true },
    episodeOpen: { type: Boolean, default: false },
    reason: String, readAt: { type: Date, default: null }, resolvedAt: Date
}, { timestamps: true });
notification.index({ recipientId: 1, type: 1, studentId: 1, offeringId: 1, scope: 1 }, { unique: true });
notification.index({ recipientId: 1, status: 1, readAt: 1, createdAt: -1, _id: -1 });
notification.index({ offeringId: 1 });

const work = new Schema({
    offeringId: { ...ref('CourseOffering'), unique: true }, requested: { type: Number, default: 0 },
    completed: { type: Number, default: 0 }, fence: { type: Number, default: 0 },
    pending: { type: Boolean, default: true }, lease: String, leaseUntil: Date,
    nextAttemptAt: { type: Date, default: () => new Date(0) }, attempts: { type: Number, default: 0 },
    lastFailure: String, lastFailedAt: Date, lastSuccessAt: Date,
    // Daily re-evaluation handles effective dates without requiring a user request.
    campusDay: String
}, { timestamps: true });
work.index({ pending: 1, nextAttemptAt: 1, leaseUntil: 1 });
module.exports = { Notification: model('Notification', notification), NotificationWork: model('NotificationWork', work) };
