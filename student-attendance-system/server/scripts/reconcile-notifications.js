// Controlled initial backfill/reconciliation. Default is preview; never prints recipient details.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { CourseOffering } = require('../src/models/Academic');
const { Notification, NotificationWork } = require('../src/models/Notification');
const R = require('../src/services/notificationReconciliation');
const A = require('../src/services/academicService');
async function main() {
    const args = process.argv.slice(2), execute = args.includes('--execute');
    const allowed = /^(--execute|--dry-run|--limit=\d+|--after=[a-f\d]{24}|--offering=[a-f\d]{24}|--term=[a-f\d]{24})$/i;
    if (args.some(a => !allowed.test(a)) || (execute && args.includes('--dry-run'))) throw new Error('Invalid arguments');
    const value = name => args.find(a => a.startsWith('--' + name + '='))?.split('=')[1];
    const limit = Number(value('limit') || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1–100');
    if (value('offering') && value('after')) throw new Error('Use offering or after, not both');
    await mongoose.connect(process.env.MONGODB_URI, { family: 4, serverSelectionTimeoutMS: 10000, autoIndex: execute, autoCreate: execute });
    const filter = {};
    if (value('offering')) filter._id = A.id(value('offering'));
    if (value('after')) filter._id = { $gt: A.id(value('after')) };
    if (value('term')) filter.termId = A.id(value('term'));
    const offerings = await CourseOffering.find(filter).select('_id').sort({ _id: 1 }).limit(limit).lean();
    let belowMinimum = 0;
    if (execute) await Promise.all([Notification.init(), NotificationWork.init()]);
    for (const o of offerings) {
        if (execute) await R.enqueue(o._id);
        else { const plan = await R.evaluate(o._id); belowMinimum += plan.entries.filter(e => e.metric?.belowMinimum === true).length; }
    }
    console.log(JSON.stringify({ mode: execute ? 'enqueued; server worker processes durable work' : 'preview; no writes', offerings: offerings.length, ...(execute ? {} : { belowMinimumRecipientPairs: belowMinimum }), nextAfter: offerings.at(-1)?._id || null }));
}
main().catch(() => { console.error('Reconciliation command failed. Verify arguments, database availability and attendance validity.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
