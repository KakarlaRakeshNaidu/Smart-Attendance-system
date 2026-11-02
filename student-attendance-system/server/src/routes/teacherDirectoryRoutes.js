const router = require('express').Router();
const { protect, requireRole, requireTeacherProfile } = require('../middleware/authMiddleware');
const C = require('../controllers/directoryController'),
    S = require('../controllers/academicDirectoryController');
const { teacherUploader } = require('../middleware/uploadMiddleware');
router.use(protect);
router.get('/my-access', requireRole('teacher'), requireTeacherProfile, C.getAccess);
router.get('/my-assignments', requireRole('teacher'), requireTeacherProfile, S.myAssignments);
router.get('/roster', requireRole('teacher', 'admin'), S.roster);
const adminProfile = async (req, res, next) => {
    if (req.userRole !== 'admin') return next();
    return require('../controllers/accountProfileController').profile(req, res);
};
router.get('/profile', adminProfile);
router.put('/profile', adminProfile);
router.post('/profile/photo', (req, res, next) => {
    if (req.userRole !== 'admin') return next();
    teacherUploader.single('profilePhoto')(req, res, (error) =>
        error ? next(error) : require('../controllers/accountProfileController').profile(req, res)
    );
});
module.exports = router;
