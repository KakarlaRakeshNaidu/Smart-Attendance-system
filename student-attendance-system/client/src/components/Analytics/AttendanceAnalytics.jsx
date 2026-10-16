import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useAuth } from '../../context/authContextState';
import api from '../../services/api';
import { useAnalyticsRequest } from './useAnalyticsRequest';
const field = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-100';
const label = o => [o.course?.code, o.course?.name, o.classGroup?.label, o.classGroup?.section, o.term?.name].filter(Boolean).join(' · ');
const percentage = r => r.percentage === null ? r.dataQuality ? 'Incomplete data — percentage unavailable' : 'No completed sessions' : r.percentage + '%';
function Notice({
  request
}) {
  return <>{request.loading && <p role="status">Loading…</p>}{request.error && <div className="card p-4 space-y-2 text-red-300" role="alert"><p>{request.error}</p><button className="btn-secondary" onClick={request.refresh}>Retry</button></div>}</>;
}
function updateQuery(params, setParams, values) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(values)) {
    if (value) next.set(key, String(value));else next.delete(key);
  }
  if (!('page' in values)) next.delete('page');
  if (!('coursePage' in values)) next.delete('coursePage');
  setParams(next);
}
function Choice({
  kind,
  title,
  value,
  onChange
}) {
  const [text, setText] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(null);
  const request = useAnalyticsRequest('/analytics/options?kind=' + kind + '&limit=30&page=' + page + '&search=' + encodeURIComponent(search));
  useEffect(() => {
    const item = request.data?.items.find(i => i.id === value);
    if (item) setSelected(item);
  }, [request.data, value]);
  return <div className="space-y-2"><form className="flex gap-2" onSubmit={e => {
      e.preventDefault();
      setPage(1);
      setSearch(text);
    }}><label className="text-sm text-zinc-400 flex-1">Search {title.toLowerCase()}<input aria-label={'Search ' + title} className={field} maxLength={120} value={text} onChange={e => setText(e.target.value)} /></label><button className="btn-secondary self-end" aria-label={'Search ' + title + ' options'}>Search</button></form>
        <label className="block text-sm text-zinc-400">{title}<select aria-label={title} className={field} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">All</option>{value && !request.data?.items.some(i => i.id === value) && <option value={value}>{selected?.id === value ? selected.label : 'Selected record (loading label)'}</option>}{request.data?.items.map(i => <option value={i.id} key={i.id}>{i.label}</option>)}</select></label>
        <Notice request={request} />{request.data?.pagination.pages > 1 && <div className="flex gap-2 text-xs items-center"><span>Options page {page} of {request.data.pagination.pages}</span><button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label={'Previous ' + title + ' options'}>Previous</button><button className="btn-secondary" disabled={page >= request.data.pagination.pages} onClick={() => setPage(p => p + 1)} aria-label={'Next ' + title + ' options'}>Next</button></div>}
    </div>;
}
function Filters({
  role,
  params,
  setParams
}) {
  // Native form values avoid stale controlled date state during fast edits/submission.
  return <section className="card p-5 space-y-4"><h2 className="font-semibold">Analytics scope</h2>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[['terms', 'Term', 'termId'], ['offerings', 'Course offering', 'offeringId'], ['classes', 'Class group', 'classGroupId'], ...(role === 'admin' ? [['teachers', 'Teacher', 'teacherId']] : []), ...(role !== 'student' ? [['students', 'Student', 'studentId']] : [])].map(([kind, title, key]) => <Choice key={kind} kind={kind} title={title} value={params.get(key)} onChange={v => updateQuery(params, setParams, {
        [key]: v
      })} />)}
    </div>
    <form className="flex flex-wrap gap-3 items-end" onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      updateQuery(params, setParams, {
        from: values.get('from'),
        to: values.get('to')
      });
    }}>
      {['from', 'to'].map(key => <label className="text-sm text-zinc-400" key={key + ':' + (params.get(key) || '')}>
        {key === 'from' ? 'From date' : 'To date'}
        <input name={key} aria-label={key === 'from' ? 'From date' : 'To date'} className={field} type="date" defaultValue={params.get(key) || ''} />
      </label>)}
      <button className="btn-primary">Apply dates</button>
      <button type="button" className="btn-secondary" onClick={() => setParams({})}>Clear filters</button>
    </form>
    <p className="text-sm text-zinc-400">Both dates are inclusive in Asia/Kolkata. Blank dates include all available history. With no selected term, each course uses its own term's minimum.</p>
  </section>;
}
function Pager({
  data,
  onChange,
  title
}) {
  return <div className="flex flex-wrap gap-3 items-center mt-4"><span>{data.total} records · Page {data.page} of {Math.max(1, data.pages)}</span><button className="btn-secondary" aria-label={'Previous ' + title} disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>Previous</button><button className="btn-secondary" aria-label={'Next ' + title} disabled={data.page >= data.pages} onClick={() => onChange(data.page + 1)}>Next</button></div>;
}
function MonthlyTooltip({
  active,
  payload
}) {
  const r = payload?.[0]?.payload;
  return active && r ? <div className="bg-zinc-900 border border-zinc-600 rounded-xl p-3 text-sm"><p>{r.month}</p><p>{percentage(r)}</p><p>{r.attended} attended / {r.eligible} eligible opportunities</p><p>Present {r.present} · Late {r.late} · Absent {r.absent}</p></div> : null;
}
function Monthly({
  items
}) {
  return <section className="card p-5 space-y-4"><h2 className="font-semibold">Monthly attendance trend</h2><p className="text-sm text-zinc-400">Grouped by lecture start time in Asia/Kolkata. Gaps mean no completed eligible sessions or incomplete data, never 0% by assumption.</p>{items.some(r => r.percentage !== null) ? <div className="h-64 min-w-0" aria-label="Monthly aggregate percentage chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={items}><CartesianGrid stroke="rgb(var(--border))" /><XAxis dataKey="month" stroke="rgb(var(--muted))" /><YAxis domain={[0, 100]} unit="%" stroke="rgb(var(--muted))" /><Tooltip content={<MonthlyTooltip />} /><Area type="linear" dataKey="percentage" name="Attendance percentage" stroke="var(--chart)" fill="var(--chart)" fillOpacity={0.15} connectNulls={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <p>No complete percentage data to chart.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><caption className="sr-only">Table equivalent of the monthly attendance chart</caption><thead><tr>{['Month', 'Present', 'Late', 'Absent', 'Attended / eligible', 'Attendance'].map(h => <th className="text-left p-2" key={h}>{h}</th>)}</tr></thead><tbody>{items.map(r => <tr className="border-t border-zinc-800" key={r.month}><td className="p-2">{r.month}</td><td className="p-2">{r.present}</td><td className="p-2">{r.late}</td><td className="p-2">{r.absent}</td><td className="p-2">{r.attended} / {r.eligible}</td><td className="p-2">{percentage(r)}</td></tr>)}</tbody></table>{!items.length && <p>No completed sessions in this scope.</p>}</div>
    </section>;
}
function MinimumSetting({
  selectedTerm,
  onSaved
}) {
  const [termId, setTermId] = useState(selectedTerm || ''),
    [value, setValue] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    lock = useRef(false);
  useEffect(() => {
    if (selectedTerm) setTermId(selectedTerm);
  }, [selectedTerm]);
  const request = useAnalyticsRequest(termId ? '/analytics/settings/' + termId : '/analytics/options?kind=terms&limit=1');
  useEffect(() => {
    if (request.data?.setting) setValue(String(request.data.setting.minimum));
  }, [request.data]);
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await api.put('/analytics/settings/' + termId, {
        minimumAttendancePercent: Number(value)
      });
      setNotice('Attendance minimum saved. Attendance records were not changed.');
      request.refresh();
      onSaved();
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not save minimum.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <section className="card p-5 space-y-4"><h2 className="font-semibold">Attendance minimum</h2><p className="text-sm text-zinc-400">Uses the existing academic term setting, default 75%. This is an application setting, not an examination-eligibility policy. Changing it recalculates status without changing attendance.</p><Choice kind="terms" title="Minimum term" value={termId} onChange={v => {
      setTermId(v);
      setNotice('');
    }} /><Notice request={request} />{termId && request.data?.setting && <form onSubmit={save} className="space-y-3"><p>{request.data.setting.term}</p><label className="block">Minimum (%)<input aria-label="Minimum (%)" className={field} required type="number" min={Number.MIN_VALUE} max="100" step="any" value={value} onChange={e => setValue(e.target.value)} /></label><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save minimum'}</button><p className="text-sm text-zinc-400">{request.data.setting.updatedAt ? 'Updated ' + new Date(request.data.setting.updatedAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata'
        }) + ' by ' + (request.data.setting.updatedBy?.name || 'Unavailable Administrator') : 'No recorded minimum-setting update.'}</p></form>}{notice && <p role="status">{notice}</p>}</section>;
}
export default function AttendanceAnalytics() {
  const {
      role
    } = useAuth(),
    [params, setParams] = useSearchParams();
  const request = useAnalyticsRequest('/analytics/' + role + '?' + params.toString()),
    data = request.data;
  const drill = offeringId => {
    const next = new URLSearchParams(params);
    next.set('offeringId', offeringId);
    next.delete('page');
    next.delete('coursePage');
    return '/attendance-analytics?' + next;
  };
  const history = offeringId => {
    const next = new URLSearchParams();
    next.set('offeringId', offeringId);
    for (const key of ['from', 'to']) if (params.get(key)) next.set(key, params.get(key));
    return '/my-attendance/history?' + next;
  };
  return <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5"><nav className="flex flex-wrap gap-4"><Link className="underline" to={role === 'admin' ? '/admin' : role === 'student' ? '/my-attendance' : '/dashboard'}>{role === 'admin' ? 'Administrator Portal' : role === 'student' ? 'Student Portal' : 'Dashboard'}</Link><Link className="underline" to="/academic">{role === 'student' ? 'My course enrolments' : role === 'teacher' ? 'My courses/classes' : 'Academic management'}</Link><Link className="underline" to={role === 'student' ? '/my-attendance/history' : role === 'admin' ? '/admin/attendance' : '/attendance'}>{role === 'student' ? 'My Attendance' : role === 'admin' ? 'Attendance browsing' : 'Attendance'}</Link></nav>
        <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Attendance Analytics</h1><button className="btn-secondary" onClick={request.refresh}>Refresh analytics</button></header>
        <Filters role={role} params={params} setParams={setParams} /><Notice request={request} />
        {data && <><p className="text-zinc-400">{data.scope} Period: {params.get('from') || 'First available lecture'} – {params.get('to') || 'Latest available lecture'} (Asia/Kolkata).</p><p className="text-sm text-zinc-400">Only completed, finalised sessions count. Present + late is attended. Unmapped legacy attendance is excluded; view it through the existing history pages. Threshold comparisons use exact counts, even when a displayed percentage rounds up.</p>
        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[[role === 'student' ? 'Eligible completed sessions' : 'Eligible Student-session opportunities', data.summary.eligible], ['Present', data.summary.present], ['Late', data.summary.late], ['Absent', data.summary.absent]].map(([title, value]) => <div className="card p-4" key={title}><h2 className="text-sm text-zinc-400">{title}</h2><p className="text-3xl font-semibold">{value}</p></div>)}</section>
        <section className="card p-5 space-y-2"><h2 className="font-semibold">{role === 'student' ? 'Personal aggregate percentage' : 'Aggregate percentage'}</h2><p className="text-xl">{percentage(data.summary)}</p><p>{data.summary.attended} attended / {data.summary.eligible} eligible opportunities across {data.summary.countableSessions} countable lectures.</p><p className="text-sm text-zinc-400">One Student-session opportunity means one eligible Student in one completed, finalised lecture. This percentage uses total counts, not an average of course or Student percentages.</p>{role !== 'student' && <p>Unique Students with eligible sessions: {data.uniqueStudents}. Below minimum: {data.uniqueStudentsBelowMinimum} unique Students across {data.belowMinimumPairs} Student-course pairs.</p>}
        {(data.summary.dataQuality || data.summary.extraMarkSessions > 0) && <div role="alert" className="text-amber-300"><p>Incomplete attendance data: percentages are withheld for affected results. Verified mark totals are partial; no absence was invented.</p><p>Invalid Student-session opportunities: {data.summary.invalid}; sessions without a saved roster: {data.summary.unknownRosterSessions}; sessions with marks outside the roster: {data.summary.extraMarkSessions}. Staff must review existing records; this page does not repair them.</p></div>}
        <p className="text-sm">Applicable minimum: {data.thresholds.map(t => t.term + ': ' + (t.minimum === null ? 'Unavailable' : t.minimum + '%')).join('; ') || 'No course offerings in this scope.'}</p></section>
        <Monthly items={data.monthly} />
        <section className="card p-5 space-y-3"><h2 className="font-semibold">Course attendance percentages</h2><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr>{['Course / term / class', 'Attended / eligible', 'Attendance', 'Minimum', 'Status', 'Details'].map(h => <th key={h} className="text-left p-2">{h}</th>)}</tr></thead><tbody>{data.courses.items.map(r => <tr key={r.offeringId} className="border-t border-zinc-800"><td className="p-2"><Link className="underline" to={drill(r.offeringId)}>{label(r)}</Link></td><td className="p-2">{r.attended} / {r.eligible}</td><td className="p-2">{percentage(r)}</td><td className="p-2">{r.minimum === null ? 'Unavailable' : r.minimum + '%'}</td><td className="p-2">{r.status}</td><td className="p-2">{role === 'student' ? <Link className="underline" to={history(r.offeringId)}>Own attendance history</Link> : r.latestSessionId ? <Link className="underline" to={'/academic/sessions/' + r.latestSessionId}>Latest permitted lecture</Link> : <span>No completed lectures</span>}</td></tr>)}</tbody></table>{!data.courses.items.length && <p>No course offerings in this scope.</p>}</div><Pager title="courses" data={data.courses.pagination} onChange={v => updateQuery(params, setParams, {
          coursePage: v
        })} /></section>
        <section className="card p-5 space-y-3"><h2 className="font-semibold">{role === 'student' ? 'Personal course status' : 'Student-course attendance'}</h2><div className="flex flex-wrap gap-3"><label>Show<select aria-label="Attendance list" className={field} value={params.get('table') || 'all'} onChange={e => updateQuery(params, setParams, {
              table: e.target.value
            })}><option value="all">{role === 'student' ? 'All my course offerings' : 'All Student-course pairs'}</option><option value="low">Below minimum only</option></select></label><label>Sort<select aria-label="Analytics sort" className={field} value={params.get('sort') || 'student'} onChange={e => updateQuery(params, setParams, {
              sort: e.target.value
            })}>{[['student', 'Student name'], ['course', 'Course code'], ['percentage-asc', 'Percentage ascending'], ['percentage-desc', 'Percentage descending']].map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label></div>
        <p className="text-sm text-zinc-400">Each row is one Student in one course offering, not one unique Student. Exactly meeting the minimum is not below minimum. No completed sessions and incomplete data are separate states.</p><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr>{['Student', 'Course / term / class', 'Present', 'Late', 'Absent', 'Attended / eligible', 'Attendance', 'Minimum', 'Status'].map(h => <th className="p-2 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{data.students.items.map(r => <tr className="border-t border-zinc-800" key={r.studentId + r.offeringId}><td className="p-2">{r.name}<span className="block text-zinc-400">{r.rollNo}</span></td><td className="p-2"><Link className="underline" to={drill(r.offeringId)}>{label(r)}</Link></td><td className="p-2">{r.present}</td><td className="p-2">{r.late}</td><td className="p-2">{r.absent}</td><td className="p-2">{r.attended} / {r.eligible}</td><td className="p-2">{percentage(r)}</td><td className="p-2">{r.minimum === null ? 'Unavailable' : r.minimum + '%'}</td><td className="p-2">{r.status}</td></tr>)}</tbody></table>{!data.students.items.length && <p>No matching Student-course records.</p>}</div><Pager title="Students" data={data.students.pagination} onChange={v => updateQuery(params, setParams, {
          page: v
        })} /></section>
        </>}{role === 'admin' && <MinimumSetting selectedTerm={params.get('termId')} onSaved={request.refresh} />}</div>;
}
