const mongoose = require('mongoose');
const { Schema } = mongoose;
const accessSchema = new Schema({
 teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
 academicYear: { type: Number, required: true, min: 1, max: 4 },
 branch: { type: String, required: true, uppercase: true, trim: true },
 section: { type: String, required: true, uppercase: true, trim: true },
 subsection: { type: String, required: true, uppercase: true, trim: true },
 assignedById: { type: Schema.Types.ObjectId, ref: 'Account', required: true }
}, { timestamps: true });
accessSchema.index({ teacherId: 1, academicYear: 1, branch: 1, section: 1, subsection: 1 }, { unique: true });
const auditSchema = new Schema({
 actorId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
 actorName: String, actorRole: String, action: { type: String, required: true },
 targetModel: String, targetId: String, changes: Schema.Types.Mixed, ip: String, userAgent: String
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ createdAt: -1, _id: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });
module.exports = { TeacherAcademicAccess: mongoose.model('TeacherAcademicAccess', accessSchema), AuditLog: mongoose.model('AuditLog', auditSchema) };
