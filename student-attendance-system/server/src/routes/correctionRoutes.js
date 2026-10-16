const router = require('express').Router();
const { protect, requireRole, requireTeacherProfile } = require('../middleware/authMiddleware');
const S = require('../services/correctionService'), Q = require('../services/correctionQuery');
const respondError = require('../utils/respondError');
router.use(protect, requireRole('student', 'teacher', 'admin'));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); return req.userRole === 'teacher' ? requireTeacherProfile(req, res, next) : next(); });
const handle = (fn, created = false) => async (req, res) => {
    try {
        if (fn !== Q.list && Object.keys(req.query).length) return res.status(400).json({ success: false, message: 'Correction detail and action endpoints accept no query parameters.' });
        const data = await fn(req); res.status(data.stale ? 409 : created ? 201 : 200).json({ success: !data.stale, ...data });
    } catch (e) { respondError(res, e); }
};
router.get('/', handle(Q.list));
router.get('/sessions/:sessionId', handle(S.context));
router.post('/sessions/:sessionId', handle(S.submit, true));
router.get('/sessions/:sessionId/requests/:requestId', handle(S.detail));
router.post('/sessions/:sessionId/requests/:requestId/:action', handle(S.decide));
module.exports = router;
