#!/usr/bin/env node
/**
 * create-admin.js
 * ===============
 * Creates the first Admin account via CLI. Safe credential input using
 * readline with echo disabled (password not shown on terminal).
 *
 * Usage:
 *   node scripts/create-admin.js
 *
 * Rules:
 *   - Will NOT create a second admin via this script if one already exists
 *     (prevents accidental duplication).
 *   - Never commits credentials ? .env is read at runtime.
 *   - Password is hashed with bcryptjs (12 rounds) before storage.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const readline = require('readline');
const Account = require('../src/models/Account');

async function connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set in .env');
    await mongoose.connect(uri);
    console.log('Connected:', mongoose.connection.host);
}

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// Read password without echoing to terminal
function askPassword(prompt) {
    return new Promise(resolve => {
        process.stdout.write(prompt);
        const stdin = process.stdin;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let password = '';
        stdin.on('data', function onData(char) {
            if (char === '\r' || char === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                process.stdout.write('\n');
                resolve(password);
            } else if (char === '\u0003') {
                process.exit();
            } else if (char === '\u007f') {
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            } else {
                password += char;
                process.stdout.write('*');
            }
        });
    });
}

async function main() {
    await connect();

    // Check for existing admin accounts
    const existingAdmin = await Account.findOne({ role: 'admin' });
    if (existingAdmin) {
        console.log('\nAn Admin account already exists:', existingAdmin.email);
        console.log('This script only creates the FIRST admin. To manage admins, use the CLI or database directly.');
        await mongoose.disconnect();
        process.exit(0);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n=== Create First Admin Account ===\n');
    const name  = await ask(rl, 'Admin name: ');
    const email = await ask(rl, 'Admin email: ');
    rl.close();

    let password;
    try {
        password = await askPassword('Admin password (min 6 chars): ');
    } catch (e) {
        // Fallback if raw mode not available (e.g. piped input)
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        password = await ask(rl2, 'Admin password (min 6 chars): ');
        rl2.close();
    }

    if (!name.trim() || !email.trim() || password.length < 6) {
        console.error('Name, email and a password of at least 6 characters are required.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const conflict = await Account.findOne({ email: normalizedEmail });
    if (conflict) {
        console.error(`Account with email ${normalizedEmail} already exists (role: ${conflict.role}).`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const admin = new Account({
        name: name.trim(),
        email: normalizedEmail,
        role: 'admin',
        isActive: true
    });
    await admin.setPassword(password);
    await admin.save();

    console.log('\nAdmin account created successfully!');
    console.log('Email:', admin.email);
    console.log('ID:   ', admin._id);
    console.log('\nYou can now log in at /login with this email and password.');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
