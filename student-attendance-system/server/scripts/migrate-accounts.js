#!/usr/bin/env node
/**
 * migrate-accounts.js
 * ===================
 * Migrates existing Teacher documents into the new Account model.
 *
 * Usage:
 *   node scripts/migrate-accounts.js --dry-run   # preview only (default)
 *   node scripts/migrate-accounts.js --run        # write to database
 *
 * Safety:
 *   - Always runs preview first when --run is not supplied.
 *   - Transfers the existing bcrypt hash WITHOUT re-hashing (setRawHash).
 *   - Idempotent: re-running never creates duplicates.
 *   - Reports: migrated / already-linked / skipped / conflicting.
 *   - Never logs password hashes or face embeddings.
 *
 * Recovery:
 *   If anything goes wrong after --run, restore from your MongoDB backup.
 *   Account documents are additive: existing Teacher, Student, Attendance
 *   documents are never modified by this script.
 *   To roll back: db.accounts.drop() in mongosh, then re-run migration.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const readline = require('readline');

// ?? Models ????????????????????????????????????????????????????????????????????
const Teacher = require('../src/models/Teacher');
const Account = require('../src/models/Account');

// ?? CLI args ??????????????????????????????????????????????????????????????????
const isDryRun = !process.argv.includes('--run');

// ?? Helpers ???????????????????????????????????????????????????????????????????
function log(msg)  { console.log(msg); }
function warn(msg) { console.warn('[WARN]', msg); }

async function connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set in .env');
    await mongoose.connect(uri);
    log('Connected to MongoDB: ' + mongoose.connection.host);
}

// ?? Main ??????????????????????????????????????????????????????????????????????
async function migrate() {
    await connect();

    const teachers = await Teacher.find().select('+password');
    log(`\nFound ${teachers.length} teacher(s) to evaluate.\n`);

    const stats = {
        migrated: [],
        alreadyLinked: [],
        skipped: [],
        conflicting: []
    };

    for (const teacher of teachers) {
        const email = teacher.email ? teacher.email.toLowerCase().trim() : null;

        if (!email) {
            warn(`Teacher ${teacher._id} (${teacher.name}) has no email ? skipping.`);
            stats.skipped.push({ id: teacher._id, name: teacher.name, reason: 'no email' });
            continue;
        }

        // Check if this teacher profile already has a linked account
        const alreadyLinked = await Account.findOne({ teacherProfileId: teacher._id });
        if (alreadyLinked) {
            log(`  ALREADY-LINKED  ${email} (account: ${alreadyLinked._id})`);
            stats.alreadyLinked.push({ email, teacherId: teacher._id });
            continue;
        }

        // Check for email conflict with a non-teacher account
        const emailConflict = await Account.findOne({ email });
        if (emailConflict) {
            warn(`Email conflict: ${email} already belongs to a ${emailConflict.role} account (${emailConflict._id}) ? skipping.`);
            stats.conflicting.push({ email, existingRole: emailConflict.role, teacherId: teacher._id });
            continue;
        }

        if (isDryRun) {
            log(`  [DRY-RUN] WOULD MIGRATE  ${email} (teacher: ${teacher._id})`);
            stats.migrated.push({ email, teacherId: teacher._id });
            continue;
        }

        // Create Account
        const account = new Account({
            name: teacher.name,
            email,
            role: 'teacher',
            isActive: true,               // existing teachers are immediately active
            teacherProfileId: teacher._id
        });
        // Transfer the existing bcrypt hash without re-hashing
        account.setRawHash(teacher.password);
        await account.save();

        log(`  MIGRATED  ${email} -> account: ${account._id}`);
        stats.migrated.push({ email, teacherId: teacher._id, accountId: account._id });
    }

    // Summary
    log('\n======= MIGRATION SUMMARY =======');
    log(`  Migrated:      ${stats.migrated.length}`);
    log(`  Already-linked:${stats.alreadyLinked.length}`);
    log(`  Skipped:       ${stats.skipped.length}`);
    log(`  Conflicting:   ${stats.conflicting.length}`);

    if (stats.skipped.length > 0) {
        log('\nSkipped teachers (add an email and re-run):');
        stats.skipped.forEach(t => log(`  - ${t.name} (${t.id}): ${t.reason}`));
    }

    if (stats.conflicting.length > 0) {
        log('\nEmail conflicts (manual resolution required):');
        stats.conflicting.forEach(c => log(`  - ${c.email} conflicts with existing ${c.existingRole} account`));
    }

    if (isDryRun) {
        log('\n[DRY-RUN] No changes written. Re-run with --run to apply.');
    } else {
        log('\nMigration complete.');
    }

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
