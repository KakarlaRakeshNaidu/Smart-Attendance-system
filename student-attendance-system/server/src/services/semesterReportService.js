const { createHash } = require('crypto');
const { AcademicTerm, ClassGroup } = require('../models/Academic');
const Account = require('../models/Account');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Analytics = require('./attendanceAnalyticsService');
const C = require('./attendanceCalculation');
const A = require('./academicService');

// Per-request bounds apply to preview AND export. No report totals are persisted.
const LIMITS = Object.freeze({ maxOfferings: 100, maxEnrolmentsPerOffering: 5000, maxRows: 10000,
    maxSessions: 2000, maxRoster: 5000, maxOpportunities: 100000, batchSize: 10, durationMs: 30000 });
const TYPES = Object.freeze({ personal: 'Personal term summary', students: 'Student/offering summary',
    courses: 'Course offering summary', classes: 'Class summary', institution: 'Institution summary' });
const scopeLabel = role => role === 'student' ? 'Only your own eligible sessions.' : role === 'teacher'
    ? 'Based only on lectures you taught; this may be a partial course offering.'
    : 'Institution-wide records within the selected academic and lecture filters.';
const same = (a, b) => String(a) === String(b);
const campusTimestamp = value => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(value).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
};
function validate(req, query) {
    const allowed = ['type', 'termId', 'offeringId', 'classGroupId', 'teacherId', 'studentId', 'from', 'to', 'page', 'limit', 'sort'];
    for (const [key, value] of Object.entries(query)) if (!allowed.includes(key) || typeof value !== 'string') A.fail(400, 'Invalid report filter.');
    if (!query.termId) A.fail(400, 'Select one academic term before generating a report.');
    const permitted = req.userRole === 'student' ? ['personal'] : req.userRole === 'teacher' ? ['students', 'courses'] : ['students', 'courses', 'classes', 'institution'];
    const type = query.type || permitted[0];
    if (!TYPES[type]) A.fail(400, 'Invalid report type.');
    if (!permitted.includes(type)) A.fail(403, 'This report type is outside your role scope.');
    if (query.sort && !['student', 'course'].includes(query.sort)) A.fail(400, 'Sort reports by Student or course.');
    const { type: ignored, ...filters } = query;
    const q = Analytics.validate(filters);
    return { ...q, type };
}
function academicView(o) {
    return { offeringId: String(o._id), course: o.courseId, term: o.termId, classGroup: o.classGroupId };
}
async function checkIdentity(req) {
    const account = await Account.findById(req.accountId).select('role isActive studentProfileId teacherProfileId').lean();
    if (!account?.isActive) A.fail(401, 'Your account is unavailable or inactive. Please sign in again.', 'SESSION_INVALID');
    if (account.role !== req.userRole || !same(account.studentProfileId, req.account.studentProfileId) || !same(account.teacherProfileId, req.account.teacherProfileId)) A.fail(401, 'Account permissions changed. Please sign in again.', 'SESSION_INVALID');
    if (req.userRole === 'teacher' && !await Teacher.exists({ _id: req.teacherId })) A.fail(403, 'Your linked Teacher profile is unavailable.');
}
function compareRows(sort) {
    return (a, b) => (sort === 'course' ? (a.course?.code || '').localeCompare(b.course?.code || '') : (a.name || '').localeCompare(b.name || ''))
        || (a.classGroup?.label || '').localeCompare(b.classGroup?.label || '') || (a.classGroup?.section || '').localeCompare(b.classGroup?.section || '')
        || String(a.offeringId || '').localeCompare(String(b.offeringId || '')) || String(a.studentId || '').localeCompare(String(b.studentId || ''))
        || String(a.key || '').localeCompare(String(b.key || ''));
}
function aggregateRows(courses, details, type, minimum) {
    const groups = new Map();
    for (const course of courses) {
        const key = type === 'institution' ? 'institution' : type === 'classes' ? String(course.classGroup?._id || 'unavailable:' + course.offeringId) : course.offeringId;
        if (!groups.has(key)) groups.set(key, { key, term: course.term, classGroup: type === 'institution' ? null : course.classGroup,
            course: type === 'courses' ? course.course : null, offeringId: type === 'courses' ? course.offeringId : null,
            offeringIds: new Set(), counts: C.emptyCounts(), countableSessions: 0, unknownRosterSessions: 0, extraMarkSessions: 0, incomplete: false });
        const g = groups.get(key); g.offeringIds.add(course.offeringId); C.addCounts(g.counts, course);
        g.countableSessions += course.countableSessions; g.unknownRosterSessions += course.unknownRosterSessions;
        g.extraMarkSessions += course.extraMarkSessions; g.incomplete ||= course.dataQuality;
    }
    return [...groups.values()].map(g => {
        const rows = details.filter(r => g.offeringIds.has(r.offeringId));
        return { key: g.key, term: g.term, course: g.course, classGroup: g.classGroup, offeringId: g.offeringId,
            ...C.result(g.counts, minimum, g.incomplete || rows.some(r => r.dataQuality)), countableSessions: g.countableSessions,
            unknownRosterSessions: g.unknownRosterSessions, extraMarkSessions: g.extraMarkSessions,
            uniqueStudents: new Set(rows.map(r => r.studentId)).size,
            uniqueStudentsWithEligibleSessions: new Set(rows.filter(r => r.eligible > 0).map(r => r.studentId)).size,
            studentOfferingResults: rows.length, belowMinimumResults: rows.filter(r => r.belowMinimum === true).length,
            incompleteResults: rows.filter(r => r.dataQuality).length, noSessionResults: rows.filter(r => !r.dataQuality && !r.eligible).length };
    });
}
async function labelsForFilters(q, courses, rows) {
    const labels = {};
    if (q.offeringId) { const o = courses.find(c => c.offeringId === q.offeringId); labels.offering = [o?.course?.code, o?.course?.name].filter(Boolean).join(' · ') || 'Unavailable offering'; }
    if (q.classGroupId) {
        const group = courses.find(c => same(c.classGroup?._id, q.classGroupId))?.classGroup || await ClassGroup.findById(q.classGroupId).select('label section').lean().maxTimeMS(15000);
        labels.classGroup = group ? [group.label, group.section].filter(Boolean).join(' ') : 'Unavailable class';
    }
    if (q.teacherId) labels.teacher = (await Teacher.findById(q.teacherId).select('name').lean().maxTimeMS(15000))?.name || 'Unavailable Teacher';
    if (q.studentId) labels.student = rows.find(row => row.studentId === q.studentId)?.name || (await Student.findById(q.studentId).select('name').lean().maxTimeMS(15000))?.name || 'Unavailable Student';
    return labels;
}
async function pass(req, q, check, signal) {
    check();
    const term = await AcademicTerm.findById(q.termId).select('name startDate endDate state minimumAttendancePercent minimumAttendanceUpdatedAt updatedAt').lean().maxTimeMS(15000);
    if (!term) A.fail(404, 'Academic term not found.');
    A.range(term.startDate, term.endDate);
    const from = q.from || term.startDate, to = q.to || term.endDate;
    A.range(from, to);
    if (from < term.startDate || to > term.endDate) A.fail(400, 'Report dates must stay within the selected term.');
    const minimum = term.minimumAttendancePercent ?? 75;
    if (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum <= 0 || minimum > 100) A.fail(409, 'The term attendance minimum is invalid. Ask an Administrator to correct its existing setting before reporting.');
    const hash = createHash('sha256'); hash.update(JSON.stringify(term));
    let selected;
    const filters = Object.fromEntries(['termId', 'offeringId', 'classGroupId', 'teacherId', 'studentId', 'sort'].filter(k => q[k]).map(k => [k, q[k]]));
    const calculated = await Analytics.calculate(req, { ...filters, from, to }, false, {
        ...LIMITS, termId: q.termId, offeringId: q.offeringId, classGroupId: q.classGroupId,
        teacherId: req.userRole === 'admin' ? q.teacherId : null, studentId: req.userRole !== 'student' ? q.studentId : null, signal, check,
        onScope(scope) { selected = scope.selected; hash.update(JSON.stringify(scope)); },
        onSession(session) { hash.update(JSON.stringify(session)); }
    });
    check();
    let rows = calculated.rows;
    // Staff zero-session visibility is deliberately different from attendance eligibility:
    // Admin may see verified enrolments; Teacher may not gain new Student visibility from them.
    if (req.userRole === 'admin') {
        const keys = new Set(rows.map(r => r.offeringId + ':' + r.studentId)), additions = [];
        for (const o of selected) for (const e of o.enrolments) {
            if (q.studentId && !same(e.studentId, q.studentId) || e.startDate > to || e.endDate < from) continue;
            const key = String(o._id) + ':' + e.studentId;
            if (keys.has(key)) continue;
            keys.add(key); additions.push({ o, studentId: String(e.studentId) });
            if (rows.length + additions.length > LIMITS.maxRows) A.fail(422, 'Too many Student/offering results. Select a class, course or Student.');
        }
        const profiles = await Student.find({ _id: { $in: [...new Set(additions.map(a => a.studentId))] } }).select('name studentId').lean().maxTimeMS(15000);
        const names = new Map(profiles.map(s => [String(s._id), s]));
        rows = [...rows, ...additions.map(({ o, studentId }) => {
            const course = calculated.courses.find(c => c.offeringId === String(o._id));
            return { studentId, name: names.get(studentId)?.name || 'Unavailable profile', rollNo: names.get(studentId)?.studentId || '',
                ...academicView(o), ...C.result(C.emptyCounts(), minimum, course.dataQuality || !names.has(studentId)) };
        })];
    }
    if (rows.length > LIMITS.maxRows) A.fail(422, 'Too many report results. Narrow the academic filters.');
    rows.sort(compareRows(q.sort));
    const filterLabels = await labelsForFilters(q, calculated.courses, rows);
    // The digest covers source revisions, selected structures/rosters, current names and output.
    // Two matching passes establish coherent source values; there is no stored report snapshot.
    hash.update(JSON.stringify({ rows, courses: calculated.courses, summary: calculated.summary, filterLabels }));
    return { digest: hash.digest('hex'), term, minimum, from, to, rows, courses: calculated.courses, summary: calculated.summary, filterLabels };
}
async function generate(req, query, options = {}) {
    const started = performance.now(), q = validate(req, query), deadline = Date.now() + LIMITS.durationMs;
    const check = () => {
        if (options.signal?.aborted) A.fail(499, 'Report generation cancelled.');
        if (Date.now() > deadline) A.fail(503, 'Report generation timed out. Narrow the academic or date filters and retry.');
    };
    let coherent;
    for (let attempt = 0; attempt < 2; attempt++) {
        const before = await pass(req, q, check, options.signal);
        const after = await pass(req, q, check, options.signal);
        if (before.digest === after.digest) { coherent = after; break; }
    }
    if (!coherent) A.fail(409, 'Report source changed during generation. Refresh the preview and retry the export.');
    check(); await checkIdentity(req); check();
    const r = coherent, aggregate = aggregateRows(r.courses, r.rows, q.type, r.minimum);
    const allRows = ['personal', 'students'].includes(q.type) ? r.rows : aggregate.sort(compareRows('course'));
    const generatedAt = new Date();
    const incomplete = r.summary.dataQuality || r.rows.some(row => row.dataQuality);
    const institution = aggregateRows(r.courses, r.rows, 'institution', r.minimum)[0] || {};
    const metrics = Object.fromEntries(['uniqueStudents', 'uniqueStudentsWithEligibleSessions', 'studentOfferingResults', 'belowMinimumResults', 'incompleteResults', 'noSessionResults'].map(k => [k, institution[k] || 0]));
    // Any affected result suppresses the aggregate, including unavailable profile diagnostics.
    const counts = Object.fromEntries(Object.keys(C.emptyCounts()).map(k => [k, r.summary[k]]));
    const summary = { ...r.summary, ...C.result(counts, r.minimum, incomplete), ...metrics };
    check();
    const metadata = { reportType: q.type, reportLabel: TYPES[q.type], role: req.userRole, scope: scopeLabel(req.userRole),
        term: r.term, filters: query, filterLabels: r.filterLabels, from: r.from, to: r.to,
        period: r.from === r.term.startDate && r.to === r.term.endDate ? 'Full term' : 'Selected-period report',
        generatedAt, generatedAtCampus: campusTimestamp(generatedAt), timezone: 'Asia/Kolkata', minimum: r.minimum,
        thresholdInterpretation: 'Current term application minimum at generation time, not a historical policy or examination decision.',
        legacyExclusion: 'Unmapped legacy attendance is excluded. Existing Legacy attendance remains accessible. Only verified mapped sessions count.',
        dataQuality: 'Missing, duplicate or conflicting finalised marks suppress affected percentages; reads never repair attendance.',
        consistency: 'Source revisions and results checked across two matching reads. Export regenerates current authorised data; a previous preview may be outdated.',
        aggregateDefinition: 'Present plus late divided by eligible completed, finalised Student-session opportunities; combined counts, not an average of percentages.',
        uniqueStudentDefinition: req.userRole === 'teacher'
            ? 'Distinct Student profiles represented by permitted lecture rosters. Student/offering results are counted separately.'
            : 'Distinct Student profiles represented in this scope, including verified no-session enrolment rows. Student/offering results are counted separately.',
        noSessionDefinition: req.userRole === 'teacher' ? 'No new Student names are inferred from enrolment: Teacher detail rows come only from permitted lecture rosters.' : 'Verified enrolments with no eligible completed lectures remain explicit no-session results.',
        limits: LIMITS, elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
    return { metadata, summary, rows: allRows, pagination: { page: q.page, limit: q.limit, total: allRows.length, pages: Math.ceil(allRows.length / q.limit) } };
}
function preview(report) {
    const { rows, pagination } = report;
    return { ...report, rows: rows.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit) };
}
module.exports = { generate, preview, validate, LIMITS, TYPES, campusTimestamp };
