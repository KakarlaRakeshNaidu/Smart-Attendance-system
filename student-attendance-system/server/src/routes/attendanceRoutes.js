const validateRequest = require('../middleware/validateRequest');
const express = require('express');
const {
    takeAttendance,
    getTodayAttendance,
    getAttendanceByDate,
    getAllAttendance,
    downloadTodayAttendanceCSV,
    downloadAttendanceCSV,
    downloadAttendanceCSVRange,
    takeFaceAttendance,
    takeMultipleFaceAttendance,
    bulkPhotoAttendance,
    checkFaceApiStatus,
    resetTodayAttendance,
    getMyAttendance
} = require('../controllers/attendanceController');
const { protect, requireRole, requireTeacherProfile } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(validateRequest);

router.use(protect);
router.use((req, res, next) => req.userRole === 'teacher' ? requireTeacherProfile(req, res, next) : next());

router.use((req,res,next) => ['POST','DELETE','PATCH','PUT'].includes(req.method)
    ? res.status(req.userRole === 'teacher' ? 409 : 403).json({success:false,code:'SESSION_REQUIRED',message:'Select an authorised lecture session before marking or resetting attendance. Legacy attendance is read-only.'})
    : next());

// ?? Teacher-only: mark and reset attendance ??????????????????????????????????
// Admin cannot mark attendance (per spec: "Cannot mark or reset attendance merely because they are Admin")
router.post('/', requireRole('teacher'), requireTeacherProfile, takeAttendance);
router.delete('/today', requireRole('teacher'), requireTeacherProfile, resetTodayAttendance);
router.post('/face', requireRole('teacher'), requireTeacherProfile, takeFaceAttendance);
router.post('/face-multiple', requireRole('teacher'), requireTeacherProfile, takeMultipleFaceAttendance);
router.post('/bulk-photos', requireRole('teacher'), requireTeacherProfile, bulkPhotoAttendance);

// ?? Teacher and Admin: read attendance and download CSVs ?????????????????????
router.get('/', requireRole('teacher', 'admin'), getAllAttendance);
router.get('/today', requireRole('teacher', 'admin'), getTodayAttendance);
router.get('/date/:date', requireRole('teacher', 'admin'), getAttendanceByDate);
router.get('/download/today', requireRole('teacher', 'admin'), downloadTodayAttendanceCSV);
router.get('/download/range', requireRole('teacher', 'admin'), downloadAttendanceCSVRange);
router.get('/download/:date', requireRole('teacher', 'admin'), downloadAttendanceCSV);
router.get('/face-status', requireRole('teacher', 'admin'), checkFaceApiStatus);

// Student self-access: own attendance only
router.get('/me', requireRole('student'), getMyAttendance);

module.exports = router;
