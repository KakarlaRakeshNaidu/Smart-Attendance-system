module.exports = (res, error, fallback = 'Request failed') => {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A record with this email or ID already exists.' });
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid record ID.' });
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Check the required fields and their values.' });
    if (error.status && error.publicMessage) return res.status(error.status).json({ success: false, message: error.publicMessage, code: error.code });
    return res.status(500).json({ success: false, message: fallback });
};
