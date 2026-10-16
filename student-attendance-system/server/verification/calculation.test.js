const {
    test
  } = require('node:test'),
  assert = require('node:assert/strict');
const C = require('../src/services/attendanceCalculation');
test('Calculation contract keeps exact thresholds, separate statuses, nulls and data-quality failures', () => {
  assert.equal(C.campusMonth('2026-01-31T19:00:00Z'), '2026-02');
  assert.equal(C.result({
    eligible: 4,
    present: 2,
    late: 1,
    absent: 1,
    invalid: 0
  }, 75).belowMinimum, false);
  const near = C.result({
    eligible: 1000,
    present: 749,
    late: 0,
    absent: 251,
    invalid: 0
  }, 75);
  assert.equal(near.percentage, 75);
  assert.equal(near.belowMinimum, true);
  assert.equal(C.result(C.emptyCounts(), 75).percentage, null);
  assert.equal(C.result({
    eligible: 1,
    present: 0,
    late: 0,
    absent: 0,
    invalid: 1
  }, 75).status, 'Incomplete data');
  assert.equal(C.result({
    eligible: 1,
    present: 1,
    late: 0,
    absent: 0,
    invalid: 0
  }, 1e-8).belowMinimum, false);
  for (const state of ['scheduled', 'cancelled']) assert.equal(C.inspectSession({
    state,
    finalised: true
  }), null);
  assert.equal(C.inspectSession({
    state: 'completed',
    finalised: false
  }), null);
  const s = {
    state: 'completed',
    finalised: true,
    attendanceStarted: true,
    roster: [{
      studentId: 'A'
    }],
    records: [{
      studentId: 'A',
      status: 'present'
    }, {
      studentId: 'A',
      status: 'absent'
    }]
  };
  assert.equal(C.inspectSession(s).opportunities[0].valid, false);
  s.records = [{
    studentId: 'A',
    status: 'present'
  }];
  s.roster.push({
    studentId: 'A'
  });
  assert.equal(C.inspectSession(s).opportunities.length, 1);
  assert.equal(C.inspectSession(s).opportunities[0].valid, false);
});
