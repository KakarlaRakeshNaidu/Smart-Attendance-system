const app = require('../src/app');
const connectDB = require('../src/config/db');
module.exports = async (req, res) => {
    try { await connectDB(); }
    catch { return res.status(503).json({ success: false, message: 'Database unavailable. Please try again.' }); }
    return app(req, res);
};
