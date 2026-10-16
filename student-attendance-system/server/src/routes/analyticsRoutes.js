const router = require('express').Router();
const {
  protect,
  requireRole,
  requireTeacherProfile
} = require('../middleware/authMiddleware');
const S = require('../services/attendanceAnalyticsService');
const respondError = require('../utils/respondError');
const wrap = fn => async (req, res) => {
  try {
    res.json({
      success: true,
      ...(await fn(req))
    });
  } catch (error) {
    if (error.code === 50) return res.status(503).json({
      success: false,
      message: 'Analytics query timed out. Narrow the selected scope and retry.'
    });
    respondError(res, error, 'Could not calculate attendance analytics. Retry with a narrower scope.');
  }
};
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(protect, requireRole('student', 'teacher', 'admin'));
router.use((req, res, next) => req.userRole === 'teacher' ? requireTeacherProfile(req, res, next) : next());
// Role-specific endpoints make direct role escalation attempts explicit.
router.get('/student', requireRole('student'), wrap(req => S.report(req, req.query)));
router.get('/teacher', requireRole('teacher'), wrap(req => S.report(req, req.query)));
router.get('/admin', requireRole('admin'), wrap(req => S.report(req, req.query)));
router.get('/options', wrap(req => S.options(req, req.query)));
router.get('/settings/:termId', wrap(async req => ({
  setting: await S.getSetting(req, req.params.termId)
})));
router.put('/settings/:termId', requireRole('admin'), wrap(async req => ({
  setting: await S.setSetting(req, req.params.termId, req.body)
})));
module.exports = router;
