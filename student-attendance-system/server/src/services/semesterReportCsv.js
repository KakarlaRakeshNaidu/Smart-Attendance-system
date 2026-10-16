const { createObjectCsvStringifier } = require('csv-writer');
const A = require('./academicService');
const MAX_BYTES = 8 * 1024 * 1024;
// CSV quoting handles delimiters, not spreadsheet formulas. A visible text prefix
// survives opening/re-saving more reliably than relying on removable quote escapes.
// Ordinary Unicode names, commas, quotes and embedded line breaks are preserved.
function safeText(value) {
    let text = String(value ?? '').replace(/</g, '‹').replace(/>/g, '›')
        .replace(/\b(?:https?|ftp|file|javascript|data):/gi, scheme => scheme + '\u200b');
    const leading = text.match(/^[\s\p{Cc}\p{Cf}]*/u)[0];
    if (/^[\s\p{Cc}\p{Cf}]*[=+\-@＝＋－＠]/u.test(text) || /[\p{Cc}\p{Cf}]/u.test(leading)) text = '[text] ' + text;
    return text;
}
const number = value => value === null || value === undefined ? '' : Number.isFinite(value) && value >= 0 ? value : '';
const textColumn = (id, title, value) => ({ id, title, value, numeric: false });
const numericColumn = (id, title, value) => ({ id, title, value, numeric: true });
function columns(report) {
    const m = report.metadata, detail = ['personal', 'students'].includes(m.reportType);
    return [
        textColumn('type', 'Report type', () => m.reportLabel), textColumn('scope', 'Role/data scope', () => m.scope),
        textColumn('term', 'Academic term', () => m.term.name), textColumn('period', 'Period', () => m.period),
        textColumn('from', 'From (inclusive, Asia/Kolkata)', () => m.from), textColumn('to', 'To (inclusive, Asia/Kolkata)', () => m.to),
        textColumn('generated', 'Generated (Asia/Kolkata)', () => m.generatedAtCampus),
        textColumn('filters', 'Selected filters', () => Object.entries(m.filterLabels).map(([key, value]) => key + ': ' + value).join('; ') || 'All permitted records in selected term'),
        textColumn('class', 'Class', r => r.classGroup?.label || (m.reportType === 'institution' ? 'All selected classes' : 'Unavailable class')),
        textColumn('section', 'Section', r => r.classGroup?.section || ''),
        textColumn('code', 'Course code', r => r.course?.code || (detail || m.reportType === 'courses' ? 'Unavailable course' : 'All selected courses')),
        textColumn('course', 'Course name', r => r.course?.name || ''),
        ...(detail ? [textColumn('roll', 'Student/roll number', r => r.rollNo), textColumn('name', 'Student name', r => r.name)] : [
            numericColumn('unique', 'Unique represented Students', r => r.uniqueStudents),
            numericColumn('eligibleStudents', 'Unique Students with eligible lectures', r => r.uniqueStudentsWithEligibleSessions),
            numericColumn('results', 'Student/offering results', r => r.studentOfferingResults),
            numericColumn('lectures', 'Countable lectures', r => r.countableSessions)
        ]),
        ...['present', 'late', 'absent', 'invalid'].map(k => numericColumn(k, k === 'invalid' ? 'Invalid opportunities' : k[0].toUpperCase() + k.slice(1), r => r[k])),
        numericColumn('eligible', detail ? 'Eligible completed/finalised sessions' : 'Eligible Student-session opportunities', r => r.eligible),
        numericColumn('attended', detail ? 'Attended sessions (present + late)' : 'Attended opportunities (present + late)', r => r.attended),
        numericColumn('percentage', detail ? 'Attendance percentage (%)' : 'Weighted aggregate percentage (%)', r => r.percentage),
        numericColumn('minimum', 'Current term minimum (%)', () => m.minimum),
        textColumn('status', 'Attendance status', r => r.status), textColumn('quality', 'Data quality', r => r.dataQuality ? 'Incomplete data — percentage unavailable' : 'Complete for the selected scope'),
        ...(!detail ? [numericColumn('low', 'Below-minimum Student/offering results', r => r.belowMinimumResults),
            numericColumn('incomplete', 'Incomplete results', r => r.incompleteResults), numericColumn('empty', 'No-completed-session results', r => r.noSessionResults),
            numericColumn('unknown', 'Lectures with unknown roster', r => r.unknownRosterSessions), numericColumn('extra', 'Lectures with out-of-roster marks', r => r.extraMarkSessions)] : []),
        ...['present', 'late', 'absent', 'eligible', 'attended', 'percentage'].map(k => numericColumn('reportTotal_' + k,
            'Report aggregate ' + k + (k === 'percentage' ? ' (%)' : '') + ' (repeated metadata)', () => report.summary?.[k])),
        textColumn('reportQuality', 'Report aggregate data quality (repeated metadata)', () => report.summary?.dataQuality ? 'Incomplete data — aggregate percentage unavailable' : 'Complete for selected scope'),
        textColumn('thresholdMeaning', 'Minimum interpretation', () => m.thresholdInterpretation),
        textColumn('legacy', 'Legacy exclusion', () => m.legacyExclusion), textColumn('consistency', 'Consistency', () => m.consistency),
        textColumn('safety', 'CSV text safety', () => 'Potential formula text uses a visible [text] prefix. Counts and percentages remain numeric; HTML/URL-like text is neutralised.')
    ];
}
function build(report, check = () => {}) {
    const fields = columns(report), writer = createObjectCsvStringifier({ header: fields.map(({ id, title }) => ({ id, title })),
        alwaysQuote: true, recordDelimiter: '\r\n' });
    const chunks = ['\uFEFF' + writer.getHeaderString()]; let bytes = Buffer.byteLength(chunks[0]);
    for (const row of report.rows) {
        check();
        const record = Object.fromEntries(fields.map(c => [c.id, c.numeric ? number(c.value(row)) : safeText(c.value(row))]));
        const line = writer.stringifyRecords([record]); bytes += Buffer.byteLength(line);
        if (bytes > MAX_BYTES) A.fail(422, 'CSV exceeds the 8 MiB export limit. Narrow the class, course, Student or date filters. No rows were downloaded.');
        chunks.push(line);
    }
    const term = String(report.metadata.term.name).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'term';
    const stamp = new Date(report.metadata.generatedAt).toISOString().replace(/[^0-9TZ]/g, '');
    return { csv: chunks.join(''), bytes, filename: `semester-report-${report.metadata.reportType}-${term}-${stamp}.csv` };
}
module.exports = { build, safeText, MAX_BYTES };
