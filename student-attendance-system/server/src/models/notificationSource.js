const { randomUUID } = require('crypto');

// A durable outbox marker is saved in the SAME MongoDB write as the source change.
// Dispatch acknowledgement uses the native collection API, deliberately bypassing these hooks.
module.exports = function notificationSource(schema) {
    schema.add({ alertsDirty: { type: Boolean, select: false }, alertsChange: { type: String, select: false }, alertsCursor: { type: require('mongoose').Schema.Types.ObjectId, select: false } });
    schema.index({ alertsDirty: 1, _id: 1 });
    const oldTransform = schema.get('toJSON')?.transform;
    schema.set('toJSON', { ...schema.get('toJSON'), transform(doc, result, options) {
        if (oldTransform) result = oldTransform(doc, result, options) || result;
        for (const field of ['alertsDirty', 'alertsChange', 'alertsCursor']) delete result[field];
        return result;
    } });
    schema.pre('save', function () {
        if (this.isNew || this.isModified()) { this.alertsDirty = true; this.alertsChange = randomUUID(); this.alertsCursor = null; }
    });
    schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
        const update = this.getUpdate();
        if (Array.isArray(update)) throw new Error('Notification sources require operator updates.');
        update.$set = { ...update.$set, alertsDirty: true, alertsChange: randomUUID(), alertsCursor: null };
    });
    schema.pre('insertMany', function (next, docs) {
        for (const doc of docs) { doc.alertsDirty = true; doc.alertsChange = randomUUID(); }
        next();
    });
};
