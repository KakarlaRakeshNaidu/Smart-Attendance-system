const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ensure upload base directories exist on startup
['uploads/teachers', 'uploads/students'].forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Created ${dir}/ directory`);
    }
});

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherAdminRoutes = require('./routes/teacherAdminRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/academic', require('./routes/academicRoutes'));
app.use('/api/students', studentRoutes);
app.use('/api/student-portal', require('./routes/studentPortalRoutes'));
app.use('/api/attendance', attendanceRoutes);
app.use('/api/teacher', teacherAdminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/admin', adminRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    const connected = require('mongoose').connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ success: connected, message: connected ? 'Server is running' : 'Database unavailable' });
});

// Error handling middleware
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Start the server
const PORT = process.env.PORT || 5000;
async function start() {
    await connectDB();
    const server = app.listen(PORT, () => {
        console.log(`Server is running on port ${server.address().port}`);
        console.log(`API available at http://localhost:${PORT}/api`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(
                `\n[ERROR] Port ${PORT} is already in use.\n` +
                `Run this command to free it, then restart:\n` +
                `  lsof -i :${PORT} -t | xargs kill -9\n`
            );
        } else {
            console.error('[ERROR] Server error:', err.message);
        }
        process.exit(1);
    });

    // Graceful shutdown on CTRL+C / nodemon restart
    const shutdown = (signal) => {
        console.log(`\n[${signal}] Shutting down gracefully...`);
        server.close(() => {
            console.log('Server closed.');
            process.exit(0);
        });
        // Force-exit if close takes too long
        setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
}

if (require.main === module) start().catch(() => {
    console.error('Server startup failed. Check database configuration.');
    process.exitCode = 1;
});



module.exports = app;
