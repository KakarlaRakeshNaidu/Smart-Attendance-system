const router = require('express').Router();
const { protect, requireRole, requireTeacherProfile } = require('../middleware/authMiddleware');
const S = require('../services/semesterReportService');
const Csv = require('../services/semesterReportCsv');
const Analytics = require('../services/attendanceAnalyticsService');
const respondError = require('../utils/respondError');
const A = require('../services/academicService');

// Memory/concurrency bounds are per Express process; never buffer unlimited exports.
const active = new Set(); let running = 0;
router.use(protect, requireRole('student', 'teacher', 'admin'));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); return req.userRole === 'teacher' ? requireTeacherProfile(req, res, next) : next(); });
router.get('/options', async (req, res) => {
    try { res.json({ success: true, ...await Analytics.options(req, req.query) }); }
    catch (e) { respondError(res, e, 'Could not load authorised report filters.'); }
});
function handle(exporting) {
    return async (req, res) => {
        const key = String(req.accountId), controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        let acquired = false;
        try {
            if (running >= 2 || active.has(key)) { res.set('Retry-After', '5'); A.fail(429, 'A report is already generating. Wait a moment and retry.'); }
            active.add(key); running++; acquired = true; res.once('close', cancel); req.once('aborted', cancel);
            const report = await S.generate(req, req.query, { signal: controller.signal });
            if (controller.signal.aborted) return;
            if (!exporting) return res.json({ success: true, ...S.preview(report) });
            if (!report.rows.length) A.fail(422, 'No matching report rows to export. Change the filters and generate a preview.');
            const file = Csv.build(report, () => { if (controller.signal.aborted) A.fail(499, 'Export cancelled.'); });
            res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.filename}"`,
                'X-Content-Type-Options': 'nosniff', 'X-Report-Rows': String(report.rows.length), 'X-Report-Generated-At': report.metadata.generatedAt.toISOString(),
                'Access-Control-Expose-Headers': 'Content-Disposition, X-Report-Rows, X-Report-Generated-At' });
            res.send(file.csv);
        } catch (e) {
            if (controller.signal.aborted || res.headersSent) return;
            if (e.code === 50) return res.status(503).json({ success: false, message: 'Report query timed out. Narrow the filters and retry.' });
            respondError(res, e, 'Report generation failed. No CSV was downloaded. Please retry.');
        } finally {
            if (acquired) { active.delete(key); running--; }
            res.off('close', cancel); req.off('aborted', cancel);
        }
    };
}
router.get('/', handle(false));
router.get('/export.csv', handle(true));
module.exports = router;
