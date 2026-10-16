import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import { StudentShell } from '../Student/StudentPortalPages';
import api from '../../services/api';

const field = 'w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-100';
const types = { personal: 'Personal term summary', students: 'Student/offering summary', courses: 'Course offering summary', classes: 'Class summary', institution: 'Institution summary' };
const allowedTypes = role => role === 'student' ? ['personal'] : role === 'teacher' ? ['students', 'courses'] : ['students', 'courses', 'classes', 'institution'];
const message = e => e.response?.data?.message || 'Semester Reports are unavailable. Please retry.';
const percent = r => r.percentage === null ? r.dataQuality ? 'Incomplete data' : 'No completed sessions' : r.percentage + '%';
function useRequest(path) {
    const [state, setState] = useState({ loading: false, data: null, error: '' }), [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);
    useEffect(() => {
        if (!path) { setState({ loading: false, data: null, error: '' }); return; }
        let current = true; const controller = new AbortController();
        setState({ loading: true, data: null, error: '' });
        api.get(path, { signal: controller.signal, timeout: 45000 }).then(({ data }) => {
            if (current) setState({ loading: false, data, error: '' });
        }).catch(e => { if (current && !controller.signal.aborted) setState({ loading: false, data: null, error: message(e) }); });
        return () => { current = false; controller.abort(); };
    }, [path, version]);
    return { ...state, refresh };
}
function Choice({ kind, title, value, onChange, required = false }) {
    const [text, setText] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState(null);
    const request = useRequest('/reports/options?kind=' + kind + '&limit=30&page=' + page + '&search=' + encodeURIComponent(search));
    useEffect(() => { const found = request.data?.items.find(i => i.id === value); if (found) setSelected(found); }, [value, request.data]);
    return <div className="min-w-0 space-y-2">
        <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(text); request.refresh(); }}>
            <label className="block flex-1 min-w-0 text-sm text-zinc-400">Search {title.toLowerCase()}<input aria-label={'Search ' + title} className={field} maxLength={120} value={text} onChange={e => setText(e.target.value)} /></label>
            <button className="btn-secondary" aria-label={'Search ' + title + ' options'}>Search</button>
        </form>
        <label className="block text-sm">{title}{required ? ' (required)' : ''}<select aria-label={title} aria-required={required} className={field} value={value || ''} onChange={e => onChange(e.target.value)}>
            <option value="">{required ? 'Select one term' : 'All permitted records'}</option>
            {value && !request.data?.items.some(i => i.id === value) && <option value={value}>{selected?.id === value ? selected.label : 'Selected record'}</option>}
            {request.data?.items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select></label>
        {request.loading && <p className="text-xs text-zinc-400" role="status">Loading options…</p>}
        {request.error && <p role="alert" className="text-sm text-red-300">{request.error} <button className="underline" onClick={request.refresh}>Retry {title.toLowerCase()} options</button></p>}
        {request.data?.pagination.pages > 1 && <div className="flex flex-wrap items-center gap-2 text-xs"><button className="btn-secondary" aria-label={'Previous ' + title + ' options'} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Options {page} / {request.data.pagination.pages}</span><button className="btn-secondary" aria-label={'Next ' + title + ' options'} disabled={page >= request.data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    </div>;
}
function Shell({ role, children }) {
    if (role === 'student') return <StudentShell title="Semester Reports">{children}</StudentShell>;
    return <div className={role === 'admin' ? 'max-w-7xl mx-auto p-4 sm:p-6 space-y-5' : 'min-w-0 space-y-5'}>
        <nav className="flex flex-wrap gap-4 text-sm"><Link className="underline" to={role === 'admin' ? '/admin' : '/attendance'}>{role === 'admin' ? 'Admin Dashboard' : 'Attendance'}</Link><Link className="underline" to="/semester-reports">Semester Reports</Link></nav>{children}
    </div>;
}
function Table({ report }) {
    const detail = ['personal', 'students'].includes(report.metadata.reportType);
    const headers = ['Term / class', 'Course', ...(detail ? ['Student'] : ['Unique Students', 'Student/offering results', 'Countable lectures']),
        'Present', 'Late', 'Absent', detail ? 'Eligible sessions' : 'Eligible opportunities', 'Attended', 'Attendance', 'Current minimum', 'Status / data quality',
        ...(!detail ? ['Below-minimum Student/offering results', 'Incomplete / no-session results'] : [])];
    return <div className="min-w-0 max-w-full overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><caption className="sr-only">{report.metadata.reportLabel} preview</caption><thead><tr>{headers.map(h => <th key={h} scope="col" className="p-2 text-left text-zinc-400">{h}</th>)}</tr></thead><tbody>{report.rows.map((r, index) => <tr key={(r.studentId || r.key) + ':' + (r.offeringId || index)} className="border-t border-zinc-800 align-top">
        <td className="p-2">{report.metadata.term.name}<span className="block text-zinc-400">{r.classGroup ? [r.classGroup.label, r.classGroup.section].filter(Boolean).join(' ') : report.metadata.reportType === 'institution' ? 'All selected classes' : 'Unavailable class'}</span></td>
        <td className="p-2">{r.course?.code || (detail ? 'Unavailable course' : 'All selected courses')}<span className="block text-zinc-400">{r.course?.name}</span></td>
        {detail ? <td className="p-2">{r.name}<span className="block text-zinc-400">{r.rollNo}</span></td> : <><td className="p-2">{r.uniqueStudents}<span className="block text-xs text-zinc-400">{r.uniqueStudentsWithEligibleSessions} with eligible lectures</span></td><td className="p-2">{r.studentOfferingResults}</td><td className="p-2">{r.countableSessions}</td></>}
        {[r.present, r.late, r.absent, r.eligible, r.attended].map((n, i) => <td key={i} className="p-2">{n}</td>)}<td className="p-2 font-semibold">{percent(r)}</td><td className="p-2">{r.minimum === null ? 'Unavailable' : r.minimum + '%'}</td><td className="p-2">{r.status}<span className="block text-xs text-zinc-400">{r.dataQuality ? 'Incomplete data — percentage unavailable' : 'Complete for selected scope'}</span>{r.invalid > 0 && <span className="block">{r.invalid} invalid opportunities</span>}</td>
        {!detail && <><td className="p-2">{r.belowMinimumResults}</td><td className="p-2">{r.incompleteResults} / {r.noSessionResults}</td></>}
    </tr>)}</tbody></table></div>;
}
export default function SemesterReports() {
    const { role } = useAuth(), [params, setParams] = useSearchParams(), query = params.toString();
    const defaults = useCallback(() => Object.fromEntries([...new URLSearchParams(query), ['type', params.get('type') || allowedTypes(role)[0]], ['limit', params.get('limit') || '20']]), [query, params, role]);
    const [draft, setDraft] = useState(defaults), [dirty, setDirty] = useState(false), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const exportController = useRef(null), generation = useRef(0), urls = useRef(new Set()), dateForm = useRef(null);
    const request = useRequest(params.get('termId') ? '/reports?' + query : null), data = request.data;
    useEffect(() => { setDraft(defaults()); setDirty(false); setNotice(''); setBusy(false); generation.current++; exportController.current?.abort(); }, [defaults]);
    useEffect(() => () => { generation.current++; exportController.current?.abort(); for (const url of urls.current) URL.revokeObjectURL(url); }, []);
    function edit(key, value) { setDraft(d => ({ ...d, [key]: value })); setDirty(true); setNotice(''); generation.current++; exportController.current?.abort(); setBusy(false); }
    function generate() {
        if (busy || request.loading) return;
        if (!draft.termId) { setNotice('Select one academic term before generating a report.'); return; }
        const dates = new FormData(dateForm.current), currentDraft = { ...draft, from: dates.get('from'), to: dates.get('to') };
        const next = new URLSearchParams();
        for (const key of ['type', 'termId', 'classGroupId', 'offeringId', 'teacherId', 'studentId', 'from', 'to', 'sort', 'limit']) if (currentDraft[key]) next.set(key, currentDraft[key]);
        setDirty(false); setNotice(''); setParams(next); if (next.toString() === query) request.refresh();
    }
    async function download() {
        if (busy || dirty || request.loading || !data) return;
        const dates = new FormData(dateForm.current);
        if (['from', 'to'].some(k => dates.get(k) !== (params.get(k) || ''))) { setDirty(true); setNotice('Dates changed. Generate a new preview before exporting.'); return; }
        const controller = new AbortController(), current = ++generation.current; exportController.current = controller; setBusy(true); setNotice('');
        try {
            const filters = new URLSearchParams(query); filters.delete('page'); filters.delete('limit');
            const response = await api.get('/reports/export.csv?' + filters, { responseType: 'blob', signal: controller.signal, timeout: 45000 });
            if (current !== generation.current || controller.signal.aborted) return;
            if (!String(response.headers['content-type']).startsWith('text/csv')) throw new Error('The server returned an error instead of a CSV. Refresh and retry.');
            const filename = response.headers['content-disposition']?.match(/filename="([A-Za-z0-9_.-]+)"/)?.[1] || 'semester-report.csv';
            const url = URL.createObjectURL(response.data); urls.current.add(url);
            const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000);
            setNotice('CSV downloaded from current authorised data (' + (response.headers['x-report-rows'] || 'all matching') + ' rows). The earlier preview may be outdated.');
        } catch (e) { if (current === generation.current && !controller.signal.aborted) setNotice(e.response ? message(e) : e.message || 'CSV download failed. Please retry.'); }
        finally { if (current === generation.current) setBusy(false); }
    }
    const page = value => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); };
    return <Shell role={role}>{role !== 'student' && <h1 className="text-2xl font-semibold">Semester Reports</h1>}<p className="text-sm text-zinc-400">Read-only term summaries. Late counts as attended. Existing daily and date-range downloads remain in Attendance → Download.</p>
        <section className="card p-4 sm:p-5 space-y-4"><h2 className="font-semibold">Report scope</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm">Report type<select aria-label="Report type" className={field} value={draft.type || allowedTypes(role)[0]} onChange={e => edit('type', e.target.value)}>{allowedTypes(role).map(t => <option key={t} value={t}>{types[t]}</option>)}</select></label>
            {[['terms', 'Term', 'termId'], ['offerings', 'Course offering', 'offeringId'], ...(role === 'admin' ? [['classes', 'Class group', 'classGroupId'], ['teachers', 'Teacher', 'teacherId'], ['students', 'Student', 'studentId']] : role === 'teacher' ? [['students', 'Student', 'studentId']] : [])].map(([kind, title, key]) => <Choice key={key} kind={kind} title={title} value={draft[key]} required={key === 'termId'} onChange={v => edit(key, v)} />)}
        </div><form ref={dateForm} onSubmit={e => { e.preventDefault(); generate(); }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{['from', 'to'].map(k => <label key={k + query} className="text-sm">{k === 'from' ? 'From date (optional)' : 'To date (optional)'}<input aria-label={k === 'from' ? 'From date' : 'To date'} className={field} type="date" name={k} defaultValue={params.get(k) || ''} onInput={e => edit(k, e.target.value)} onChange={e => edit(k, e.target.value)} /></label>)}
            <label className="text-sm">Sort<select aria-label="Sort" className={field} value={draft.sort || 'student'} onChange={e => edit('sort', e.target.value)}><option value="student">Student</option><option value="course">Course</option></select></label>
            <label className="text-sm">Rows per page<select aria-label="Rows per page" className={field} value={draft.limit || '20'} onChange={e => edit('limit', e.target.value)}>{[...new Set([draft.limit || '20', '10', '20', '50', '100'])].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        </form><p className="text-sm text-zinc-400">Select exactly one term. Blank dates use its full start/end range; both campus dates are inclusive in Asia/Kolkata. A narrower range is labelled a selected-period report.</p><div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={request.loading || busy} onClick={generate}>Generate / refresh preview</button><button className="btn-secondary" disabled={busy || dirty || request.loading || !data?.pagination.total} onClick={download}>{busy ? 'Generating CSV…' : 'Export CSV'}</button><button className="btn-secondary" onClick={() => { dateForm.current?.reset(); setParams({}); setDraft({ type: allowedTypes(role)[0], limit: '20' }); setDirty(false); setNotice(''); }}>Clear filters</button></div>
        {dirty && <p role="status" className="text-amber-300">Filters changed. Generate a preview before exporting. Any displayed preview uses its previously applied filters.</p>}</section>
        {notice && <p role="status" className="card p-4">{notice}</p>}{!params.get('termId') && <p className="card p-5 text-zinc-400">Select a term and generate your report. No attendance is changed by previewing or downloading.</p>}
        {request.loading && <p role="status" className="card p-5">Generating report preview…</p>}{request.error && <div role="alert" className="card p-5 space-y-3"><p className="text-red-300">{request.error}</p><button className="btn-secondary" onClick={request.refresh}>Retry preview</button></div>}
        {data && <><section className="card p-5 space-y-3 break-words"><h2 className="font-semibold">{data.metadata.reportLabel} · {data.metadata.period}</h2><p>{data.metadata.scope}</p><p>{data.metadata.term.name} · {data.metadata.from} – {data.metadata.to} inclusive (Asia/Kolkata)</p><p>Generated {data.metadata.generatedAtCampus}</p><p>Current term minimum: <strong>{data.metadata.minimum}%</strong>. {data.metadata.thresholdInterpretation}</p>{Object.keys(data.metadata.filterLabels).length > 0 && <p>Applied filters: {Object.entries(data.metadata.filterLabels).map(([k, v]) => k + ': ' + v).join(' · ')}</p>}
            <p className="text-sm text-zinc-400">{data.metadata.consistency}</p><p className="text-sm text-zinc-400">{data.metadata.legacyExclusion}</p><p className="text-sm text-zinc-400">{data.metadata.dataQuality}</p><p className="text-sm text-zinc-400">{data.metadata.noSessionDefinition}</p>
            <Link className="underline text-sm" to={'/attendance-analytics?' + new URLSearchParams(Object.fromEntries([...params].filter(([k]) => !['type', 'page', 'limit'].includes(k)))).toString()}>Open Attendance Analytics for this scope</Link>
        </section><section className="card p-5 space-y-3"><h2 className="font-semibold">{role === 'student' ? 'Personal combined attendance' : 'Weighted aggregate attendance'}: {percent(data.summary)}</h2><p>Present {data.summary.present} · Late {data.summary.late} · Absent {data.summary.absent} · Attended {data.summary.attended} / {data.summary.eligible} eligible opportunities</p><p className="text-sm text-zinc-400">{data.metadata.aggregateDefinition}</p>{role !== 'student' && <p className="text-sm">{data.summary.uniqueStudents} unique represented Students · {data.summary.studentOfferingResults} Student/offering results · {data.summary.countableSessions} countable lectures</p>}{role !== 'student' && <p className="text-xs text-zinc-400">{data.metadata.uniqueStudentDefinition}</p>}
            {data.summary.dataQuality && <p role="status" className="text-amber-300">Incomplete data — aggregate percentage unavailable. {data.summary.invalid} invalid opportunities; {data.summary.unknownRosterSessions} lectures with unknown rosters; {data.summary.extraMarkSessions} with out-of-roster marks. No historical records were repaired.</p>}
        </section><section className="card min-w-0 max-w-full p-4 space-y-4"><h2 className="font-semibold">Report preview · {data.pagination.total} matching rows</h2>{data.rows.length ? <Table report={data} /> : <p className="text-zinc-400">No matching report rows. Change the filters and generate again.</p>}<div className="flex flex-wrap items-center gap-3"><button className="btn-secondary" aria-label="Previous report page" disabled={data.pagination.page <= 1 || dirty} onClick={() => page(data.pagination.page - 1)}>Previous</button><span>Page {data.pagination.page} of {Math.max(1, data.pagination.pages)}</span><button className="btn-secondary" aria-label="Next report page" disabled={data.pagination.page >= data.pagination.pages || dirty} onClick={() => page(data.pagination.page + 1)}>Next</button></div><p className="text-xs text-zinc-400">Export includes every matching row, not just this page. Limits: 100 offerings, 2,000 lectures, 100,000 eligible opportunities, 10,000 result rows and an 8 MiB CSV. Oversized scopes fail explicitly; no rows are silently omitted.</p></section></>}
    </Shell>;
}
