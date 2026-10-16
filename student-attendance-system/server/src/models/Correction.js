const { Schema } = require('mongoose');
const reference = model => ({ type: Schema.Types.ObjectId, ref: model });
const states = ['pending_teacher', 'escalated_admin', 'approved', 'rejected', 'withdrawn', 'stale'];
const event = new Schema({ action: String, actorId: reference('Account'), actorRole: { type: String, enum: ['student', 'teacher', 'admin', 'system'] }, reason: { type: String, maxlength: 1000 }, at: Date }, { _id: false });
const request = new Schema({
    studentId: { ...reference('Student'), required: true }, submittedBy: { ...reference('Account'), required: true },
    originalStatus: { type: String, enum: ['present', 'absent', 'late'], required: true },
    requestedStatus: { type: String, enum: ['present', 'absent', 'late'], required: true },
    originalFingerprint: { type: String, required: true }, originalEntryRevision: Number, submittedSessionRevision: Number,
    studentReason: { type: String, required: true, minlength: 5, maxlength: 1000 },
    state: { type: String, enum: states, required: true }, submittedAt: Date, updatedAt: Date,
    routeReason: String, reviewerId: reference('Account'), reviewerRole: { type: String, enum: ['student', 'teacher', 'admin', 'system'] },
    decisionAt: Date, decisionReason: { type: String, maxlength: 1000 },
    changeId: Schema.Types.ObjectId, approvedSessionRevision: Number, events: [event]
});
const slot = new Schema({ current: { type: request, default: undefined }, history: { type: [request], default: [] } }, { _id: false });
const audit = new Schema({
    requestId: { type: Schema.Types.ObjectId, required: true }, studentId: { ...reference('Student'), required: true },
    previousStatus: { type: String, enum: ['present', 'absent', 'late'], required: true }, newStatus: { type: String, enum: ['present', 'absent', 'late'], required: true },
    actorId: { ...reference('Account'), required: true }, actorRole: { type: String, enum: ['teacher', 'admin'], required: true },
    reason: { type: String, required: true, minlength: 5, maxlength: 1000 }, at: { type: Date, required: true },
    previousEntryRevision: Number, entryRevision: Number, sessionRevision: Number,
    originalMarkedAt: Date, originalMethod: String
});
function install(lecture, mark) {
    mark.add({ correctionRevision: { type: Number, default: 0 }, correctedAt: Date, correctedBy: reference('Account') });
    // Each canonical Student key has exactly ONE unresolved slot. Submission and decisions
    // compare the session revision in MongoDB, so concurrent writes cannot add a second slot.
    // Past requests and approval audits live with attendance, not in a cross-document saga.
    lecture.add({ correctionSlots: { type: Map, of: slot, default: undefined, select: false },
        correctionAudit: { type: [audit], default: undefined, select: false }, hasOpenCorrections: { type: Boolean, default: false, select: false } });
    lecture.index({ hasOpenCorrections: 1, offeringId: 1, _id: 1 });
    lecture.path('correctionSlots').validate(value => {
        if (!value) return true;
        const ids = new Set();
        for (const [student, entry] of value) {
            if (!/^[a-f0-9]{24}$/.test(student)) return false;
            if (entry.current && !['pending_teacher', 'escalated_admin'].includes(entry.current.state)) return false;
            if (entry.history.some(r => ['pending_teacher', 'escalated_admin'].includes(r.state))) return false;
            for (const r of [...entry.history, ...(entry.current ? [entry.current] : [])]) {
                if (String(r.studentId) !== student || ids.has(String(r._id))) return false;
                ids.add(String(r._id));
            }
        }
        return true;
    }, 'Correction slot identity or lifecycle is inconsistent.');
}
module.exports = { install, states };
