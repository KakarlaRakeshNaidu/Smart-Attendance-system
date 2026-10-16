// One calculation contract for analytics and existing Student percentages. No writes.
const campusMonth = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit'
}).format(new Date(value));
const emptyCounts = () => ({
  eligible: 0,
  present: 0,
  late: 0,
  absent: 0,
  invalid: 0
});
function inspectSession(s) {
  if (s.state !== 'completed' || s.finalised !== true) return null;
  if (!s.attendanceStarted || !Array.isArray(s.roster) || !s.roster.length || s.roster.some(r => !r?.studentId)) return {
    opportunities: [],
    unknownRoster: true,
    extraMarks: false
  };
  const members = new Map(),
    marks = new Map();
  for (const r of s.roster) {
    const id = String(r.studentId);
    members.set(id, {
      ...r,
      duplicates: (members.get(id)?.duplicates || 0) + 1
    });
  }
  for (const r of Array.isArray(s.records) ? s.records : []) {
    const id = String(r.studentId);
    if (!marks.has(id)) marks.set(id, []);
    marks.get(id).push(r);
  }
  return {
    unknownRoster: false,
    extraMarks: [...marks.keys()].some(id => !members.has(id)),
    opportunities: [...members].map(([studentId, m]) => {
      const entries = marks.get(studentId) || [],
        valid = m.duplicates === 1 && entries.length === 1 && ['present', 'absent', 'late'].includes(entries[0].status);
      return {
        studentId,
        name: m.name,
        rollNo: m.rollNo,
        valid,
        status: valid ? entries[0].status : null
      };
    })
  };
}
function addOpportunity(counts, o) {
  counts.eligible++;
  if (!o.valid) counts.invalid++;else counts[o.status]++;
}
function addCounts(target, source) {
  for (const key of Object.keys(emptyCounts())) target[key] += source[key];
}
// Decimal rational comparison uses counts, never the rounded percentage.
function belowMinimum(attended, eligible, minimum) {
  const [mantissa, exponent = '0'] = String(minimum).toLowerCase().split('e');
  const power = (mantissa.split('.')[1] || '').length - Number(exponent);
  let numerator = BigInt(mantissa.replace('.', '')),
    denominator = 1n;
  if (power >= 0) denominator = 10n ** BigInt(power);else numerator *= 10n ** BigInt(-power);
  return BigInt(attended) * 100n * denominator < BigInt(eligible) * numerator;
}
function result(counts, minimum = null, incomplete = false) {
  const attended = counts.present + counts.late,
    dataQuality = Boolean(incomplete || counts.invalid);
  const percentage = counts.eligible && !dataQuality ? Math.round(attended * 100 / counts.eligible) : null;
  const valid = typeof minimum === 'number' && Number.isFinite(minimum) && minimum > 0 && minimum <= 100;
  return {
    ...counts,
    attended,
    percentage,
    dataQuality,
    minimum: valid ? minimum : null,
    belowMinimum: percentage !== null && valid ? belowMinimum(attended, counts.eligible, minimum) : null,
    status: dataQuality ? 'Incomplete data' : !counts.eligible ? 'No completed sessions' : !valid ? 'Minimum unavailable' : belowMinimum(attended, counts.eligible, minimum) ? 'Below minimum' : 'At or above minimum'
  };
}
module.exports = {
  campusMonth,
  emptyCounts,
  inspectSession,
  addOpportunity,
  addCounts,
  result,
  belowMinimum
};
