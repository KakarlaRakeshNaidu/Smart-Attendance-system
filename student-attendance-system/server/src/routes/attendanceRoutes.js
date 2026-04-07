const express = require('express');
const { 
    takeAttendance, 
    getTodayAttendance, 
    getAttendanceByDate,
    getAllAttendance,
    downloadTodayAttendanceCSV,
    downloadAttendanceCSV,
    takeFaceAttendance,
    takeMultipleFaceAttendance,
    checkFaceApiStatus,
    resetTodayAttendance
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Manual attendance
router.post('/', takeAttendance);
router.get('/', getAllAttendance);
router.get('/today', getTodayAttendance);
router.get('/date/:date', getAttendanceByDate);
router.get('/download/today', downloadTodayAttendanceCSV);
router.get('/download/:date', downloadAttendanceCSV);
router.delete('/today', resetTodayAttendance);

// Face recognition attendance
router.post('/face', takeFaceAttendance);
router.post('/face-multiple', takeMultipleFaceAttendance);
router.get('/face-status', checkFaceApiStatus);

module.exports = router;