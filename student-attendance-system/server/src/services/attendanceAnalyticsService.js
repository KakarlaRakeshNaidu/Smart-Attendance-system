const mongoose = require('mongoose');
const {
  AcademicTerm,
  ClassGroup,
  CourseOffering,
  LectureSession
} = require('../models/Academic');
const Student = require('../models/Student'),
  Teacher = require('../models/Teacher');
const A = require('./academicService'),
  C = require('./attendanceCalculation');
const oid = v => new mongoose.Types.ObjectId(A.id(v));
const same = (a, b) => String(a) === String(b);
const minimum = term => term ? term.minimumAttendancePercent ?? 75 : null;
const context = query => query.populate('courseId', 'code name state').populate('termId', 'name startDate endDate state minimumAttendancePercent minimumAttendanceUpdatedAt').populate('classGroupId', 'label section state');
const courseView = o => ({
  offeringId: String(o._id),
  course: o.courseId,
  term: o.termId,
  classGroup: o.classGroupId
});
function validate(query) {
  const allowed = ['termId', 'offeringId', 'classGroupId', 'studentId', 'teacherId', 'from', 'to', 'page', 'limit', 'coursePage', 'sort', 'table'];
  for (const key of Object.keys(query)) if (!allowed.includes(key) || typeof query[key] !== 'string') A.fail(400, 'Invalid analytics filter: ' + key + '.');
  for (const key of ['termId', 'offeringId', 'classGroupId', 'studentId', 'teacherId']) if (query[key]) A.id(query[key]);
  for (const key of ['from', 'to']) if (query[key]) A.day(query[key]);
  if (query.from && query.to) {
    A.range(query.from, query.to);
    if (new Date(query.to) - new Date(query.from) > 3660 * 86400000) A.fail(400, 'Choose a date range of at most ten years.');
  }
  const integer = (v, d, max) => {
    if (v === undefined) return d;
    if (!/^\d+$/.test(v) || +v < 1 || +v > max) A.fail(400, 'Invalid pagination.');
    return +v;
  };
  if (query.sort && !['student', 'course', 'percentage-asc', 'percentage-desc'].includes(query.sort)) A.fail(400, 'Invalid sort.');
  if (query.table && !['all', 'low'].includes(query.table)) A.fail(400, 'Invalid table filter.');
  return {
    ...query,
    page: integer(query.page, 1, 10000),
    limit: integer(query.limit, 20, 100),
    coursePage: integer(query.coursePage, 1, 10000)
  };
}
async function authorisedOfferings(req, controls = {}) {
  let filter = {};
  if (req.userRole === 'student') {
    const mine = await require('./studentPortalService').identity(req);
    const saved = await LectureSession.distinct('offeringId', {
      'roster.studentId': mine,
      attendanceStarted: true
    });
    filter = {
      $or: [{
        'enrolments.studentId': mine
      }, {
        _id: {
          $in: saved
        }
      }]
    };
  } else if (req.userRole === 'teacher') {
    if (!req.teacherId) A.fail(403, 'A linked Teacher profile is required.');
    const taught = await LectureSession.distinct('offeringId', {
      teacherId: req.teacherId
    });
    filter = {
      $or: [{
        'assignments.teacherId': req.teacherId
      }, {
        _id: {
          $in: taught
        }
      }]
    };
  } else if (req.userRole !== 'admin') A.fail(403, 'Analytics access denied.');
  const academicFilter = controls.termId ? { termId: controls.termId,
    ...(controls.offeringId ? { _id: controls.offeringId } : {}), ...(controls.classGroupId ? { classGroupId: controls.classGroupId } : {}) } : null;
  const additional = [];
  if (controls.teacherId) additional.push({ $or: [{ 'assignments.teacherId': controls.teacherId }, { _id: { $in: await LectureSession.distinct('offeringId', { teacherId: controls.teacherId }) } }] });
  if (controls.studentId) additional.push({ $or: [{ 'enrolments.studentId': controls.studentId }, { _id: { $in: await LectureSession.distinct('offeringId', { 'roster.studentId': controls.studentId, attendanceStarted: true }) } }] });
  if (academicFilter && additional.length) academicFilter.$and = additional;
  const query = CourseOffering.find(academicFilter ? { $and: [filter, academicFilter] } : filter)
    .select('courseId termId classGroupId enrolments' + (controls.maxOfferings ? ' revision updatedAt state' : ''));
  if (controls.maxOfferings) query.limit(controls.maxOfferings + 1).sort({ _id: 1 }).slice('enrolments', controls.maxEnrolmentsPerOffering + 1).maxTimeMS(15000);
  const offerings = await context(query).lean();
  if (controls.maxOfferings && (offerings.length > controls.maxOfferings || offerings.some(o => o.enrolments.length > controls.maxEnrolmentsPerOffering))) A.fail(422, 'Report scope is too large. Select a class or course offering.');
  return offerings;
}
async function scope(req, query, controls = {}) {
  const q = validate(query),
    offerings = await authorisedOfferings(req, controls);
  if (req.userRole === 'student' && (q.teacherId || q.studentId && !same(q.studentId, req.account.studentProfileId))) A.fail(403, 'Students can request only their own analytics.');
  if (req.userRole === 'teacher' && q.teacherId && !same(q.teacherId, req.teacherId)) A.fail(403, 'Teacher analytics include only lectures you taught.');
  for (const [key, field] of [['offeringId', '_id'], ['termId', 'termId'], ['classGroupId', 'classGroupId']]) if (q[key] && !offerings.some(o => same(o[field]?._id || o[field], q[key]))) {
    if (req.userRole === 'admin' && key !== 'offeringId') {
      const model = key === 'termId' ? AcademicTerm : ClassGroup;
      if (!(await model.exists({
        _id: q[key]
      }))) A.fail(404, 'Academic record not found.');
    } else A.fail(req.userRole === 'admin' ? 404 : 403, 'This academic record is outside your analytics scope.');
  }
  const selected = offerings.filter(o => (!q.offeringId || same(o._id, q.offeringId)) && (!q.termId || same(o.termId?._id, q.termId)) && (!q.classGroupId || same(o.classGroupId?._id, q.classGroupId)));
  const mine = req.userRole === 'student' ? String(req.account.studentProfileId) : q.studentId || null;
  const match = {
    offeringId: {
      $in: selected.map(o => o._id)
    },
    state: 'completed',
    finalised: true
  };
  if (req.userRole === 'teacher') match.teacherId = oid(req.teacherId);else if (q.teacherId) {
    if (!(await Teacher.exists({
      _id: q.teacherId
    }))) A.fail(404, 'Teacher profile not found.');
    match.teacherId = oid(q.teacherId);
  }
  if (q.from || q.to) {
    match.scheduledStart = {};
    if (q.from) match.scheduledStart.$gte = new Date(q.from + 'T00:00:00+05:30');
    if (q.to) match.scheduledStart.$lte = new Date(q.to + 'T23:59:59.999+05:30');
  }
  if (mine) {
    if (req.userRole !== 'student') {
      if (!(await Student.exists({
        _id: mine
      }))) A.fail(404, 'Student profile not found.');
      if (req.userRole === 'teacher' && !(await LectureSession.exists({
        teacherId: req.teacherId,
        offeringId: {
          $in: selected.map(o => o._id)
        },
        'roster.studentId': mine
      }))) A.fail(403, 'Student is outside your taught-session rosters.');
    }
    const possible = selected.flatMap(o => o.enrolments.filter(e => same(e.studentId, mine)).map(e => ({
      offeringId: o._id,
      $or: [{
        attendanceStarted: {
          $ne: true
        }
      }, {
        'roster.0': {
          $exists: false
        }
      }],
      campusDate: {
        $gte: e.startDate,
        $lte: e.endDate
      }
    })));
    match.$or = [{
      'roster.studentId': oid(mine),
      attendanceStarted: true
    }, ...possible];
  }
  return {
    q,
    selected,
    match,
    mine
  };
}
const group = () => ({
  counts: C.emptyCounts(),
  sessions: 0,
  unknown: 0,
  extra: 0
});
function increment(target, inspected, sessionId) {
  target.sessions++;
  target.latestSessionId = String(sessionId);
  if (inspected.unknownRoster) target.unknown++;
  if (inspected.extraMarks) target.extra++;
  for (const o of inspected.opportunities) C.addOpportunity(target.counts, o);
}
function finishGroup(g, policy = null) {
  return {
    ...C.result(g.counts, policy, g.unknown > 0 || g.extra > 0),
    countableSessions: g.sessions,
    latestSessionId: g.latestSessionId || null,
    unknownRosterSessions: g.unknown,
    extraMarkSessions: g.extra
  };
}
async function calculate(req, query = {}, includeMonthly = true, controls = {}) {
  const started = performance.now(),
    {
      q,
      selected,
      match,
      mine
    } = await scope(req, query, controls);
  controls.check?.();
  controls.onScope?.({ selected, match, mine });
  const byOffering = new Map(selected.map(o => [String(o._id), o]));
  const courses = new Map(selected.map(o => [String(o._id), group()])),
    pairs = new Map(),
    months = new Map(),
    all = group();
  // Scope, including Student-only array projection, is applied by MongoDB BEFORE calculation.
  const project = {
    ...(controls.onSession ? { revision: 1, teacherId: 1, campusDate: 1 } : {}),
    offeringId: 1,
    scheduledStart: 1,
    state: 1,
    finalised: 1,
    attendanceStarted: 1,
    roster: mine ? {
      $filter: {
        input: {
          $cond: [{
            $isArray: '$roster'
          }, '$roster', []]
        },
        as: 'r',
        cond: {
          $eq: ['$$r.studentId', oid(mine)]
        }
      }
    } : 1,
    records: mine ? {
      $filter: {
        input: {
          $cond: [{
            $isArray: '$records'
          }, '$records', []]
        },
        as: 'r',
        cond: {
          $eq: ['$$r.studentId', oid(mine)]
        }
      }
    } : 1
  };
  const cursor = LectureSession.aggregate([{
    $match: match
  }, {
    $sort: {
      scheduledStart: 1,
      _id: 1
    }
  }, {
    $project: project
  }]).option({
    maxTimeMS: 15000
  }).allowDiskUse(true).cursor({
    batchSize: controls.batchSize || 200
  });
  const cancel = () => { cursor.close().catch(() => {}); };
  controls.signal?.addEventListener('abort', cancel, { once: true });
  let visited = 0, opportunities = 0;
  try {
    for await (const session of cursor) {
      controls.check?.();
      if (controls.maxSessions && ++visited > controls.maxSessions) A.fail(422, 'Too many lectures for one report. Narrow the date range or course filter.');
      if (controls.maxRoster && session.roster.length > controls.maxRoster) A.fail(422, 'A lecture roster is too large for this report. Select a Student filter.');
      controls.onSession?.(session);
      const inspected = C.inspectSession(session),
        offeringId = String(session.offeringId),
        month = C.campusMonth(session.scheduledStart);
      opportunities += inspected.opportunities.length;
      if (controls.maxOpportunities && opportunities > controls.maxOpportunities) A.fail(422, 'Too many Student-session opportunities. Narrow the report filters.');
      if (includeMonthly && !months.has(month)) months.set(month, group());
      increment(all, inspected, session._id);
      increment(courses.get(offeringId), inspected, session._id);
      if (includeMonthly) increment(months.get(month), inspected, session._id);
      for (const o of inspected.opportunities) {
        const key = offeringId + ':' + o.studentId;
        if (!pairs.has(key)) pairs.set(key, {
          offeringId,
          studentId: o.studentId,
          name: o.name,
          rollNo: o.rollNo,
          counts: C.emptyCounts()
        });
        C.addOpportunity(pairs.get(key).counts, o);
      }
      if (pairs.size > (controls.maxRows || 100000)) A.fail(422, 'This scope is too large. Select a term, class or date range.');
    }
  } finally {
    controls.signal?.removeEventListener('abort', cancel);
    await cursor.close();
  }
  controls.check?.();
  if (req.userRole === 'student') for (const o of selected) {
    const key = String(o._id) + ':' + mine;
    if (!pairs.has(key)) pairs.set(key, {
      offeringId: String(o._id),
      studentId: mine,
      name: req.studentProfile.name,
      rollNo: req.studentProfile.studentId,
      counts: C.emptyCounts()
    });
  }
  const students = req.userRole === 'student' ? [req.studentProfile] : await Student.find({
    _id: {
      $in: [...new Set([...pairs.values()].map(p => p.studentId))]
    }
  }).select('name studentId').lean();
  const names = new Map(students.map(s => [String(s._id), s]));
  const rows = [...pairs.values()].map(p => {
    const o = byOffering.get(p.offeringId);
    return {
      studentId: p.studentId,
      name: names.get(p.studentId)?.name || p.name || 'Unavailable profile',
      rollNo: names.get(p.studentId)?.studentId || p.rollNo || '',
      ...courseView(o),
      ...C.result(p.counts, minimum(o.termId), courses.get(p.offeringId).unknown > 0 || courses.get(p.offeringId).extra > 0)
    };
  });
  const courseRows = selected.map(o => ({
    ...courseView(o),
    ...finishGroup(courses.get(String(o._id)), minimum(o.termId))
  }));
  const observed = [...months.keys()].sort(),
    first = q.from?.slice(0, 7) || observed[0],
    last = q.to?.slice(0, 7) || observed.at(-1);
  if (includeMonthly && first && last) {
    let value = first,
      count = 0;
    while (value <= last) {
      if (++count > 121) A.fail(422, 'Choose at most ten years for the monthly trend.');
      if (!months.has(value)) months.set(value, group());
      const [year, month] = value.split('-').map(Number);
      value = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    }
  }
  return {
    q,
    rows,
    courses: courseRows,
    monthly: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, g]) => ({
      month,
      ...finishGroup(g)
    })),
    summary: {
      ...finishGroup(all),
      status: all.counts.eligible && !all.unknown && !all.extra && !all.counts.invalid ? 'Aggregate percentage' : finishGroup(all).status
    },
    elapsedMs: Math.round((performance.now() - started) * 100) / 100
  };
}
function page(items, number, limit) {
  return {
    items: items.slice((number - 1) * limit, number * limit),
    pagination: {
      page: number,
      limit,
      total: items.length,
      pages: Math.ceil(items.length / limit)
    }
  };
}
async function report(req, query) {
  const calculated = await calculate(req, query),
    {
      q,
      rows,
      courses,
      summary
    } = calculated,
    low = rows.filter(r => r.belowMinimum === true);
  const sorted = [...(q.table === 'low' ? low : rows)].sort((a, b) => {
    if (q.sort?.startsWith('percentage')) {
      if (a.percentage === null && b.percentage !== null) return 1;
      if (b.percentage === null && a.percentage !== null) return -1;
      const comparison = (a.attended / (a.eligible || 1) - b.attended / (b.eligible || 1)) * (q.sort === 'percentage-desc' ? -1 : 1);
      if (comparison) return comparison;
    }
    const field = q.sort === 'course' ? r => r.course?.code || '' : r => r.name;
    return field(a).localeCompare(field(b)) || a.offeringId.localeCompare(b.offeringId) || a.studentId.localeCompare(b.studentId);
  });
  return {
    summary,
    monthly: calculated.monthly,
    courses: page(courses.sort((a, b) => (a.course?.code || '').localeCompare(b.course?.code || '') || a.offeringId.localeCompare(b.offeringId)), q.coursePage, q.limit),
    students: page(sorted, q.page, q.limit),
    belowMinimumPairs: low.length,
    ...(req.userRole === 'student' ? {} : {
      uniqueStudents: new Set(rows.filter(r => r.eligible).map(r => r.studentId)).size,
      uniqueStudentsBelowMinimum: new Set(low.map(r => r.studentId)).size
    }),
    thresholds: [...new Map(courses.map(c => [String(c.term?._id), {
      termId: c.term?._id,
      term: c.term?.name || 'Unavailable term',
      minimum: c.minimum
    }])).values()],
    scope: req.userRole === 'teacher' ? 'Only sessions taught by your linked Teacher profile; this may be a partial offering.' : req.userRole === 'student' ? 'Only your own eligible sessions.' : 'Institution-wide records within the selected filters.',
    filters: query,
    timezone: 'Asia/Kolkata',
    generatedAt: new Date(),
    elapsedMs: calculated.elapsedMs
  };
}
async function personalSummaries(req) {
  return (await calculate(req, {}, false)).courses.map(c => ({
    ...c,
    total: c.eligible,
    presentCount: c.present,
    present: c.attended
  }));
}
async function options(req, query) {
  for (const key of Object.keys(query)) if (!['kind', 'search', 'page', 'limit'].includes(key) || typeof query[key] !== 'string') A.fail(400, 'Invalid option query.');
  const kind = query.kind;
  if (!['terms', 'classes', 'offerings', 'teachers', 'students'].includes(kind)) A.fail(400, 'Invalid filter kind.');
  if (req.userRole === 'student' && ['teachers', 'students'].includes(kind)) A.fail(403, 'Students have no group filter options.');
  if (req.userRole === 'teacher' && kind === 'teachers') A.fail(403, 'Teacher identity is fixed to your signed-in account.');
  const {
      page: number,
      limit
    } = validate({
      page: query.page || '1',
      limit: query.limit || '100'
    }),
    search = query.search || '';
  if (search.length > 120) A.fail(400, 'Search is too long.');
  const offerings = await authorisedOfferings(req);
  let items;
  if (kind === 'teachers' || kind === 'students') {
    const model = kind === 'teachers' ? Teacher : Student,
      filter = {};
    if (req.userRole === 'teacher') filter._id = {
      $in: await LectureSession.distinct('roster.studentId', {
        teacherId: req.teacherId
      })
    };
    if (search) {
      const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{
        name: {
          $regex: literal,
          $options: 'i'
        }
      }, {
        [kind === 'students' ? 'studentId' : 'email']: {
          $regex: literal,
          $options: 'i'
        }
      }];
    }
    const [docs, total] = await Promise.all([model.find(filter).select(kind === 'teachers' ? 'name' : 'name studentId').sort({
      name: 1,
      _id: 1
    }).skip((number - 1) * limit).limit(limit).lean(), model.countDocuments(filter)]);
    return {
      items: docs.map(d => ({
        id: String(d._id),
        label: d.name + (d.studentId ? ' · ' + d.studentId : '')
      })),
      pagination: {
        page: number,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  if (req.userRole === 'admin' && kind !== 'offerings') {
    const model = kind === 'terms' ? AcademicTerm : ClassGroup,
      docs = await model.find().select(kind === 'terms' ? 'name' : 'label section').lean();
    items = docs.map(d => ({
      id: String(d._id),
      label: kind === 'terms' ? d.name : d.label + ' ' + d.section
    }));
  } else items = [...new Map(offerings.map(o => {
    const doc = kind === 'terms' ? o.termId : o.classGroupId;
    return kind === 'offerings' ? [String(o._id), {
      id: String(o._id),
      label: [o.courseId?.code, o.courseId?.name, o.classGroupId?.label, o.classGroupId?.section, o.termId?.name].filter(Boolean).join(' · ')
    }] : [String(doc?._id), doc ? {
      id: String(doc._id),
      label: kind === 'terms' ? doc.name : doc.label + ' ' + doc.section
    } : null];
  })).values()].filter(Boolean);
  return page(items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)), number, limit);
}
async function getSetting(req, termId) {
  A.id(termId);
  if (req.userRole !== 'admin' && !(await authorisedOfferings(req)).some(o => same(o.termId?._id, termId))) A.fail(403, 'Term is outside your scope.');
  const term = await AcademicTerm.findById(termId).populate('minimumAttendanceUpdatedBy', 'name').lean();
  if (!term) A.fail(404, 'Term not found.');
  return {
    termId: term._id,
    term: term.name,
    minimum: minimum(term),
    updatedAt: term.minimumAttendanceUpdatedAt || null,
    ...(req.userRole === 'admin' ? {
      updatedBy: term.minimumAttendanceUpdatedBy ? {
        id: term.minimumAttendanceUpdatedBy._id,
        name: term.minimumAttendanceUpdatedBy.name
      } : null
    } : {})
  };
}
async function setSetting(req, termId, body) {
  if (req.userRole !== 'admin') A.fail(403, 'Only Admin may change the minimum.');
  if (!body || Object.keys(body).length !== 1 || typeof body.minimumAttendancePercent !== 'number' || !Number.isFinite(body.minimumAttendancePercent) || body.minimumAttendancePercent <= 0 || body.minimumAttendancePercent > 100) A.fail(400, 'Provide only a numeric minimumAttendancePercent greater than 0 and at most 100.');
  const term = await AcademicTerm.findByIdAndUpdate(A.id(termId), {
    $set: {
      minimumAttendancePercent: body.minimumAttendancePercent,
      minimumAttendanceUpdatedAt: new Date(),
      minimumAttendanceUpdatedBy: req.accountId
    }
  }, {
    new: true,
    runValidators: true
  });
  if (!term) A.fail(404, 'Term not found.');
  return getSetting(req, termId);
}
module.exports = {
  validate,
  calculate,
  report,
  personalSummaries,
  options,
  getSetting,
  setSetting,
  authorisedOfferings
};
