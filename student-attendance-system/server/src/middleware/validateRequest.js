const mongoose = require('mongoose');
const validateRequest = (req, res, next) => {
    const reject = message => res.status(400).json({ success: false, message });
    for (const key of ['id', 'accountId']) if (req.params[key] && !mongoose.isObjectIdOrHexString(req.params[key])) return reject('Invalid record ID.');
    if (req.query.teacherId && !mongoose.isObjectIdOrHexString(req.query.teacherId)) return reject('Invalid teacher ID.');
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body))) return reject('Request body must be an object.');
    for (const key of ['name', 'email', 'password', 'currentPassword', 'newPassword', 'token', 'studentProfileId', 'studentId', 'subject', 'class', 'section', 'description', 'image', 'faceImage']) {
        if (req.body?.[key] !== undefined && typeof req.body[key] !== 'string') return reject(`${key} must be text.`);
    }
    if (req.body?.studentProfileId && !mongoose.isObjectIdOrHexString(req.body.studentProfileId)) return reject('Invalid student profile ID.');
    if (req.body?.studentId && !/^[a-zA-Z0-9_-]+$/.test(req.body.studentId)) return reject('Student ID must use letters, numbers, underscores or hyphens.');
    if (req.body?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())) return reject('Enter a valid email address.');
    for (const key of ['token']) if (req.query[key] !== undefined && typeof req.query[key] !== 'string') return reject('Invalid activation token.');
    next();
};
module.exports = validateRequest;
