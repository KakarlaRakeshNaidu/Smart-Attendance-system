const respondError = require('../utils/respondError');
module.exports = (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON body.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request is too large.' });
    if (err.name === 'MulterError' || err.message?.startsWith('Only image')) return res.status(400).json({ success: false, message: 'Upload a supported image under 10 MB.' });
    return respondError(res, err);
};
