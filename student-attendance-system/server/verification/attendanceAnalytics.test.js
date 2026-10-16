const {
    test
  } = require('node:test'),
  assert = require('node:assert/strict');
const {
  seedAnalytics,
  cleanup,
  password
} = require('./analyticsFixtures');
const {
  AcademicTerm,
  Course,
  CourseOffering,
  LectureSession
} = require('../src/models/Academic');
const Student = require('../src/models/Student');
const Analytics = require('../src/services/attendanceAnalyticsService');
test('Attendance Analytics API accuracy, ownership, settings, historical eligibility and realistic queries', async t => {
  const d = await seedAnalytics(),
    {
      fx
    } = d;
  let server;
  try {
    server = require('../src/app').listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    const tokens = {};
    for (const role of ['student', 'teacher', 'admin', 'otherTeacher']) {
      const r = await fetch(base + '/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: fx.users[role].email,
          password
        })
      });
      assert.equal(r.status, 200);
      tokens[role] = (await r.json()).token;
    }
    async function req(path, role = 'admin', method = 'GET', body) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + tokens[role],
          'Content-Type': 'application/json'
        },
        ...(body ? {
          body: JSON.stringify(body)
        } : {})
      });
      return {
        status: r.status,
        data: await r.json()
      };
    }
    function ok(r, status = 200) {
      assert.equal(r.status, status, r.data.message);
      return r.data;
    }
    function safe(data) {
      const json = JSON.stringify(data);
      for (const key of ['faceEmbedding', 'activationToken', 'passwordHash', 'roster', 'records']) assert.ok(!json.includes('"' + key + '"'), key + ' leaked');
    }
    const route = role => '/analytics/' + (role === 'otherTeacher' ? 'teacher' : role);
    await t.test('weighted summaries, status counts, same-day lectures and monthly India boundaries', async () => {
      const data = ok(await req(route('admin')));
      safe(data);
      assert.equal(data.summary.eligible, 9);
      assert.equal(data.summary.attended, 5);
      assert.equal(data.summary.percentage, 56);
      assert.equal(data.summary.present, 3);
      assert.equal(data.summary.late, 2);
      assert.equal(data.summary.absent, 4);
      assert.equal(data.summary.countableSessions, 5);
      const primary = data.courses.items.find(c => c.offeringId === d.primary.id);
      assert.equal(primary.percentage, 63);
      assert.equal(primary.eligible, 8);
      assert.notEqual(data.summary.percentage, Math.round((primary.percentage + 0) / 2));
      assert.equal(data.uniqueStudents, 2);
      assert.equal(data.belowMinimumPairs, 2);
      assert.equal(data.uniqueStudentsBelowMinimum, 2);
      const january = data.monthly.find(m => m.month === '2026-01'),
        february = data.monthly.find(m => m.month === '2026-02');
      assert.equal(january.eligible, 2);
      assert.equal(february.eligible, 7);
      assert.equal(january.attended + february.attended, data.summary.attended);
      const india = ok(await req(route('admin') + '?offeringId=' + d.primary.id + '&from=2026-02-01&to=2026-02-01'));
      assert.equal(india.summary.countableSessions, 1);
      assert.equal(india.summary.late, 1);
      const twice = ok(await req(route('admin') + '?offeringId=' + d.primary.id + '&from=2026-02-02&to=2026-02-02'));
      assert.equal(twice.summary.countableSessions, 2);
      assert.equal(twice.summary.eligible, 4);
    });
    await t.test('Student own percentages match existing shared consumers and reveal no classmates', async () => {
      const data = ok(await req(route('student'), 'student'));
      safe(data);
      assert.equal(data.summary.eligible, 5);
      assert.equal(data.summary.attended, 3);
      assert.equal(data.summary.percentage, 60);
      assert.equal(data.uniqueStudents, undefined);
      const primary = data.students.items.find(r => r.offeringId === d.primary.id);
      assert.equal(primary.percentage, 75);
      assert.equal(primary.belowMinimum, false);
      assert.equal(primary.status, 'At or above minimum');
      assert.equal(data.students.items.find(r => r.offeringId === d.zero.id).percentage, null);
      const text = JSON.stringify(data);
      assert.ok(!text.includes(fx.otherStudent.name));
      assert.ok(!text.includes(fx.otherStudent.id));
      assert.ok(!text.includes('AN-PRIVATE'));
      assert.ok(!text.includes(fx.otherStudent.email));
      const existing = ok(await req('/academic/my-summary', 'student')).items;
      for (const c of data.courses.items) {
        const old = existing.find(s => s.offeringId === c.offeringId);
        assert.equal(old.percentage, c.percentage);
        assert.equal(old.present, c.attended);
        assert.equal(old.total, c.eligible);
      }
      const own = ok(await req('/student-portal/courses', 'student')).items.find(c => c.offeringId === d.primary.id);
      assert.equal(own.summary.percentage, 75);
    });
    await t.test('Teacher gets only own lectures and permitted historical reads, never another Teacher totals', async () => {
      const data = ok(await req(route('teacher'), 'teacher'));
      assert.equal(data.summary.eligible, 7);
      assert.equal(data.summary.attended, 4);
      assert.ok(!JSON.stringify(data).includes('AN-PRIVATE'));
      const a = data.students.items.find(r => r.offeringId === d.primary.id && r.studentId === fx.student.id);
      assert.equal(a.percentage, 100);
      const other = ok(await req(route('otherTeacher'), 'otherTeacher'));
      assert.equal(other.summary.eligible, 2);
      assert.equal(other.summary.attended, 1);
      ok(await req(route('teacher') + '?offeringId=' + d.privateOffering.id, 'teacher'), 403);
      ok(await req(route('teacher') + '?teacherId=' + d.otherTeacher.id, 'teacher'), 403);
      const original = d.primary.assignments.map(a => a.toObject());
      await CourseOffering.updateOne({
        _id: d.primary.id
      }, {
        $set: {
          assignments: original.map(a => ({
            ...a,
            endDate: '2025-12-31',
            state: 'withdrawn'
          }))
        }
      });
      assert.equal(ok(await req(route('teacher') + '?offeringId=' + d.primary.id, 'teacher')).summary.eligible, 6);
      await CourseOffering.updateOne({
        _id: d.primary.id
      }, {
        $set: {
          assignments: original
        }
      });
    });
    await t.test('role escalation, foreign IDs and filter options are checked on the server', async () => {
      for (const role of ['student', 'teacher']) ok(await req('/analytics/admin', role), 403);
      ok(await req('/analytics/teacher', 'student'), 403);
      ok(await req('/analytics/student', 'teacher'), 403);
      ok(await req('/analytics/student?studentId=' + fx.otherStudent.id, 'student'), 403);
      ok(await req('/analytics/student?teacherId=' + fx.teacher.id, 'student'), 403);
      ok(await req('/analytics/student?offeringId=' + d.privateOffering.id, 'student'), 403);
      ok(await req('/analytics/student?classGroupId=' + d.foreignGroup.id, 'student'), 403);
      for (const kind of ['students', 'teachers']) ok(await req('/analytics/options?kind=' + kind, 'student'), 403);
      const choices = ok(await req('/analytics/options?kind=offerings', 'student'));
      assert.ok(!JSON.stringify(choices).includes('AN-PRIVATE'));
      ok(await req('/analytics/options?kind=teachers', 'teacher'), 403);
      safe(ok(await req('/analytics/options?kind=students', 'teacher')));
      assert.equal(ok(await req('/analytics/options?kind=students&search=%5B.*%5D')).pagination.total, 0);
    });
    await t.test('pagination, sorting, low-only tables, invalid inputs and empty months', async () => {
      const first = ok(await req('/analytics/admin?limit=1')),
        second = ok(await req('/analytics/admin?limit=1&page=2'));
      assert.equal(first.students.items.length, 1);
      assert.notEqual(first.students.items[0].offeringId + first.students.items[0].studentId, second.students.items[0].offeringId + second.students.items[0].studentId);
      const low = ok(await req('/analytics/admin?table=low&sort=percentage-asc'));
      assert.equal(low.students.pagination.total, 2);
      assert.ok(low.students.items.every(r => r.belowMinimum));
      for (const query of ['page=0', 'limit=101', 'sort=name', 'table=invalid', 'role=admin', 'from=2026-02-30', 'from=2027-01-01&to=2026-01-01', 'studentId=bad', 'from[]=2026-01-01', 'classGroupId=bad']) ok(await req('/analytics/admin?' + query), 400);
      const empty = ok(await req('/analytics/admin?from=2026-06-01&to=2026-07-31'));
      assert.equal(empty.summary.percentage, null);
      assert.deepEqual(empty.monthly.map(m => m.percentage), [null, null]);
    });
    await t.test('threshold reads, exact boundaries, Admin-only updates and immutable attendance', async () => {
      assert.equal(ok(await req('/analytics/settings/' + d.term.id, 'student')).setting.minimum, 75);
      const before = JSON.stringify(await LectureSession.find().sort({
        _id: 1
      }).lean());
      for (const role of ['teacher', 'student']) ok(await req('/analytics/settings/' + d.term.id, role, 'PUT', {
        minimumAttendancePercent: 80
      }), 403);
      for (const value of [0, -1, 101, '80', null]) ok(await req('/analytics/settings/' + d.term.id, 'admin', 'PUT', {
        minimumAttendancePercent: value
      }), 400);
      ok(await req('/analytics/settings/' + d.term.id, 'admin', 'PUT', {
        minimumAttendancePercent: 80,
        role: 'teacher'
      }), 400);
      const saved = ok(await req('/analytics/settings/' + d.term.id, 'admin', 'PUT', {
        minimumAttendancePercent: 80
      }));
      assert.equal(saved.setting.updatedBy.id, fx.users.admin.id);
      const data = ok(await req('/analytics/student', 'student'));
      assert.equal(data.students.items.find(r => r.offeringId === d.primary.id).belowMinimum, true);
      assert.equal(data.thresholds[0].minimum, 80);
      assert.equal(JSON.stringify(await LectureSession.find().sort({
        _id: 1
      }).lean()), before);
      ok(await req('/analytics/settings/' + d.term.id, 'admin', 'PUT', {
        minimumAttendancePercent: 75
      }));
      ok(await req('/academic/structures/terms/' + d.term.id, 'admin', 'PATCH', {
        minimumAttendancePercent: 82
      }));
      assert.equal(ok(await req('/analytics/settings/' + d.term.id)).setting.minimum, 82);
      ok(await req('/analytics/settings/' + d.term.id, 'admin', 'PUT', {
        minimumAttendancePercent: 75
      }));
    });
    await t.test('saved rosters survive enrolment changes; no lectures before/after enrolment are invented', async () => {
      const old = d.primary.enrolments.map(e => e.toObject());
      await CourseOffering.updateOne({
        _id: d.primary.id
      }, {
        $set: {
          enrolments: old.filter(e => String(e.studentId) !== fx.student.id)
        }
      });
      assert.equal(ok(await req('/analytics/student?offeringId=' + d.primary.id, 'student')).summary.eligible, 4);
      const extra = await Student.create({
        name: 'ISOLATED Later enrollee',
        studentId: 'AN-LATER'
      });
      await CourseOffering.updateOne({
        _id: d.primary.id
      }, {
        $push: {
          enrolments: {
            studentId: extra.id,
            startDate: '2026-03-01',
            endDate: '2026-03-31'
          }
        }
      });
      const scoped = ok(await req('/analytics/admin?studentId=' + extra.id));
      assert.equal(scoped.summary.eligible, 0);
      assert.equal(scoped.summary.percentage, null);
      await CourseOffering.updateOne({
        _id: d.primary.id
      }, {
        $set: {
          enrolments: old
        }
      });
    });
    await t.test('missing/conflicting/duplicate finalised marks suppress affected percentages without inventing absence', async () => {
      for (const variant of ['missing', 'conflicting', 'duplicate-roster', 'invalid', 'empty-roster']) {
        const s = await d.lecture(d.primary, '2026-03-10T03:30:00Z', ['present', 'present']);
        try {
          if (variant === 'missing') await LectureSession.updateOne({
            _id: s.id
          }, {
            $pull: {
              records: {
                studentId: fx.student.id
              }
            }
          });
          if (variant === 'conflicting') await LectureSession.updateOne({
            _id: s.id
          }, {
            $push: {
              records: {
                studentId: fx.student.id,
                status: 'absent',
                method: 'manual',
                markedAt: new Date()
              }
            }
          });
          if (variant === 'duplicate-roster') await LectureSession.updateOne({
            _id: s.id
          }, {
            $push: {
              roster: s.roster[0].toObject()
            }
          });
          if (variant === 'invalid') await LectureSession.collection.updateOne({
            _id: s._id
          }, {
            $set: {
              'records.0.status': 'invalid-status'
            }
          });
          if (variant === 'empty-roster') await LectureSession.updateOne({
            _id: s.id
          }, {
            $set: {
              roster: []
            }
          });
          const data = ok(await req('/analytics/student?offeringId=' + d.primary.id, 'student'));
          assert.equal(data.summary.percentage, null, variant);
          assert.equal(data.summary.dataQuality, true, variant);
          const existing = ok(await req('/academic/my-summary', 'student')).items.find(c => c.offeringId === d.primary.id);
          assert.equal(existing.percentage, null);
          assert.equal(existing.dataQuality, true);
        } finally {
          await LectureSession.deleteOne({
            _id: s.id
          });
        }
      }
    });
    await t.test('unmapped legacy stays excluded; explicit completed mapping counts exactly once', async () => {
      const before = ok(await req('/analytics/student', 'student')).summary.eligible;
      const mapped = await d.lecture(d.secondary, '2026-03-01T03:30:00Z', ['late'], {
        legacyAttendanceId: d.legacy.id
      });
      try {
        const after = ok(await req('/analytics/student', 'student'));
        assert.equal(after.summary.eligible, before + 1);
        assert.equal(after.summary.late, 2);
        assert.ok(await require('../src/models/Attendance').exists({
          _id: d.legacy.id
        }));
      } finally {
        await LectureSession.deleteOne({
          _id: mapped.id
        });
      }
    });
    await t.test('Admin analytics add no marking authority and missing/inactive profiles fail cleanly', async () => {
      ok(await req('/academic/sessions/' + d.sessions[0].id + '/attendance', 'admin', 'POST', {
        records: []
      }), 403);
      ok(await req('/academic/sessions/' + d.sessions[0].id + '/finalise', 'admin', 'POST', {}), 403);
      const Account = require('../src/models/Account');
      await Account.updateOne({
        _id: fx.users.student.id
      }, {
        $set: {
          isActive: false
        }
      });
      ok(await req('/analytics/student', 'student'), 401);
      await Account.updateOne({
        _id: fx.users.student.id
      }, {
        $set: {
          isActive: true
        },
        $unset: {
          studentProfileId: 1
        }
      });
      ok(await req('/analytics/student', 'student'), 403);
      await Account.updateOne({
        _id: fx.users.student.id
      }, {
        $set: {
          studentProfileId: fx.student.id
        }
      });
    });
    await t.test('existing Student pages keep all historical percentages without a monthly chart range restriction', async () => {
      const historicalTerm = await AcademicTerm.create({
        name: 'ISOLATED Historic term',
        startDate: '2010-01-01',
        endDate: '2020-12-31'
      });
      const historicalOffering = await CourseOffering.create({
        courseId: d.primary.courseId,
        termId: historicalTerm.id,
        classGroupId: d.group.id,
        assignments: [{
          teacherId: fx.teacher.id,
          startDate: '2010-01-01',
          endDate: '2020-12-31'
        }],
        enrolments: [{
          studentId: fx.student.id,
          startDate: '2010-01-01',
          endDate: '2020-12-31'
        }]
      });
      const historical = await d.lecture(historicalOffering, '2010-02-01T03:30:00Z', ['present']);
      try {
        const previous = ok(await req('/academic/my-summary', 'student')).items.find(c => c.offeringId === historicalOffering.id);
        assert.equal(previous.percentage, 100);
        const bounded = ok(await req('/analytics/student?from=2010-01-01&to=2010-12-31', 'student'));
        assert.equal(bounded.summary.eligible, 1);
        assert.equal(bounded.summary.percentage, 100);
      } finally {
        await LectureSession.deleteOne({
          _id: historical.id
        });
        await CourseOffering.deleteOne({
          _id: historicalOffering.id
        });
        await AcademicTerm.deleteOne({
          _id: historicalTerm.id
        });
      }
    });
    await t.test('500 Students across 40 lectures are calculated with bounded queries and scoped indexes', async () => {
      const profiles = await Student.insertMany(Array.from({
        length: 500
      }, (_, i) => ({
        studentId: 'PERF-' + i,
        name: 'ISOLATED Performance ' + i
      })));
      const course = await Course.create({
        code: 'AN-PERF',
        name: 'ISOLATED performance fixture'
      });
      const offering = await CourseOffering.create({
        courseId: course.id,
        termId: d.term.id,
        classGroupId: d.group.id
      });
      const roster = profiles.map(s => ({
        studentId: s._id,
        name: s.name,
        rollNo: s.studentId
      }));
      await LectureSession.insertMany(Array.from({
        length: 40
      }, (_, i) => {
        const start = new Date(Date.UTC(2026, 3, 1, 0, i * 30));
        return {
          offeringId: offering.id,
          teacherId: fx.teacher.id,
          scheduledStart: start,
          scheduledEnd: new Date(+start + 1200000),
          campusDate: require('../src/services/academicService').campusDate(start),
          state: 'completed',
          finalised: true,
          attendanceStarted: true,
          roster,
          records: profiles.map((s, j) => ({
            studentId: s._id,
            status: ['present', 'late', 'absent'][j % 3],
            method: 'manual',
            markedAt: start
          })),
          createdBy: fx.users.admin.id,
          updatedBy: fx.users.admin.id
        };
      }));
      const mongoose = require('mongoose'),
        previousDebug = mongoose.get('debug');
      let databaseOperations = 0;
      mongoose.set('debug', () => {
        databaseOperations++;
      });
      let data;
      const started = performance.now();
      try {
        data = ok(await req('/analytics/admin?offeringId=' + offering.id + '&limit=20'));
      } finally {
        mongoose.set('debug', previousDebug || false);
      }
      assert.ok(databaseOperations <= 15, 'No per-Student/session query loop');
      assert.equal(data.summary.eligible, 20000);
      assert.equal(data.students.pagination.total, 500);
      assert.equal(data.students.items.length, 20);
      safe(data);
      console.log('Analytics fixture measurement: 500 Students x 40 lectures; ' + Math.round(performance.now() - started) + ' ms HTTP; ' + data.elapsedMs + ' ms server calculation; ' + databaseOperations + ' database method calls (cursor batches excluded).');
      const plan = await LectureSession.find({
        teacherId: fx.teacher._id,
        state: 'completed',
        finalised: true
      }).select('_id').explain('executionStats');
      assert.ok(plan.executionStats.totalKeysExamined > 0);
      assert.ok(plan.executionStats.nReturned >= 40);
    });
  } finally {
    if (server) await new Promise(r => server.close(r));
    await cleanup();
  }
});
