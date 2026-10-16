import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import api from '../../services/api';
import { StudentShell } from '../Student/StudentPortalPages';
import { notificationsChanged } from '../Notifications/notificationState';

const field = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-zinc-100';
const labels = { pending_teacher: 'Pending Teacher review', escalated_admin: 'Escalated to Admin', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', stale: 'Stale — attendance changed' };
const campus = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const errorText = e => e.response?.data?.message || 'Attendance corrections are unavailable. Please retry.';
const sessionPath = id => '/corrections/sessions/' + id;
const detailPath = (sessionId, requestId) => sessionPath(sessionId) + '/requests/' + requestId;
const detailLink = r => '/attendance-corrections/sessions/' + r.sessionId + '/requests/' + r.id;
function useRequest(path) {
    const [state, setState] = useState({ loading: true, data: null, error: '' }), [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);
    useEffect(() => {
        let current = true; const controller = new AbortController();
        setState({ loading: true, data: null, error: '' });
        api.get(path, { signal: controller.signal, timeout: 20000 }).then(r => { if (current) setState({ loading: false, data: r.data, error: '' }); }).catch(e => { if (current && !controller.signal.aborted) setState({ loading: false, data: null, error: errorText(e) }); });
        return () => { current = false; controller.abort(); };
    }, [path, version]);
    useEffect(() => { window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [refresh]);
    return { ...state, refresh };
}
function State({ request }) {
    if (request.loading) return <p role="status" className="card p-5 text-zinc-400">Loading attendance corrections…</p>;
    if (request.error) return <div role="alert" className="card p-5 space-y-3"><p>{request.error}</p><button className="btn-secondary" onClick={request.refresh}>Retry</button><Link className="ml-4 underline" to="/attendance-corrections">Correction history</Link></div>;
    return null;
}
function Shell({ children }) {
    const { role } = useAuth();
    if (role === 'student') return <StudentShell title="Attendance corrections">{children}</StudentShell>;
    return <div className={role === 'admin' ? 'max-w-7xl mx-auto p-4 sm:p-6 space-y-5' : 'space-y-5'}>
        <nav className="flex flex-wrap gap-4 text-sm"><Link className="underline" to={role === 'admin' ? '/admin' : '/attendance'}>{role === 'admin' ? 'Admin Dashboard' : 'Attendance'}</Link><Link className="underline" to="/attendance-corrections">Attendance corrections</Link><Link className="underline" to="/attendance-analytics">Attendance Analytics</Link></nav>{children}
    </div>;
}
function Context({ item }) {
    return <div className="space-y-2 text-sm break-words"><h2 className="text-lg font-semibold">{item.course?.code} · {item.course?.name || 'Unavailable course'}</h2><p className="text-zinc-400">{item.term?.name || 'Unavailable term'} · {item.classGroup?.label} {item.classGroup?.section}</p><p>{campus(item.scheduledStart)} – {campus(item.scheduledEnd)} (Asia/Kolkata)</p><p>Teacher: {item.teacher?.name || 'Unavailable Teacher'}</p>{item.student && <p>Student: {item.student.name || 'Unavailable profile'} · {item.student.studentId}</p>}</div>;
}
function OfferingFilter({ value, onChange }) {
    const [search, setSearch] = useState(''), [applied, setApplied] = useState(''), [page, setPage] = useState(1);
    const request = useRequest('/analytics/options?kind=offerings&limit=50&page=' + page + '&search=' + encodeURIComponent(applied));
    return <div className="space-y-2 min-w-0"><label className="block text-sm">Search course offerings<input className={field} value={search} onChange={e => setSearch(e.target.value)} maxLength={120} /></label><button className="btn-secondary" type="button" onClick={() => { setApplied(search); setPage(1); request.refresh(); }}>Search offerings</button>
        <label className="block text-sm">Course offering<select className={field} value={value} onChange={e => onChange(e.target.value)}><option value="">All permitted offerings</option>{value && !request.data?.items.some(i => i.id === value) && <option value={value}>Selected offering</option>}{request.data?.items.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        {request.loading && <p className="text-xs text-zinc-400">Loading offerings…</p>}{request.error && <p role="alert" className="text-sm">{request.error} <button type="button" className="underline" onClick={request.refresh}>Retry offerings</button></p>}
        {request.data?.pagination.pages > 1 && <div className="flex items-center gap-3 text-xs"><button type="button" className="underline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous offerings</button><span>Offering options page {page}</span><button type="button" className="underline" disabled={page >= request.data.pagination.pages} onClick={() => setPage(p => p + 1)}>More offerings</button></div>}
    </div>;
}
export function CorrectionQueue() {
    const { role } = useAuth(), [params, setParams] = useSearchParams();
    const request = useRequest('/corrections?' + params.toString());
    const update = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
    const data = request.data;
    return <Shell><header><h1 className="text-2xl font-semibold">{role === 'student' ? 'My correction history' : 'Attendance corrections'}</h1><p className="text-sm text-zinc-400 mt-2">{role === 'student' ? 'Open a finalised lecture in My Attendance to request a change. Only staff can decide a request.' : role === 'teacher' ? 'Review lectures you taught while your effective assignment permits it. Historical read access does not grant correction authority.' : 'View all requests. Approve or reject only escalated requests or requests without an eligible original Teacher reviewer.'}</p></header>
        <section className="card p-4 space-y-4"><div className="grid gap-4 md:grid-cols-2"><OfferingFilter value={params.get('offeringId') || ''} onChange={v => update('offeringId', v)} /><div className="space-y-3">
            <label className="block">Request state<select className={field} value={params.get('state') || ''} onChange={e => update('state', e.target.value)}><option value="">All states</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {role !== 'student' && <label className="block">Review queue<select className={field} value={params.get('queue') || 'all'} onChange={e => update('queue', e.target.value)}><option value="all">All permitted requests and history</option><option value="actionable">Requests I can review</option></select></label>}
            <label className="block">Sort<select className={field} value={params.get('sort') || 'newest'} onChange={e => update('sort', e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        </div></div>
        <form key={(params.get('from') || '') + (params.get('to') || '')} className="flex flex-wrap gap-3 items-end" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget), next = new URLSearchParams(params); for (const key of ['from', 'to']) { const value = form.get(key); value ? next.set(key, value) : next.delete(key); } next.delete('page'); setParams(next); }}>
            <label>Lecture from<input name="from" type="date" className={field} defaultValue={params.get('from') || ''} /></label><label>Lecture to<input name="to" type="date" className={field} defaultValue={params.get('to') || ''} /></label><button className="btn-secondary">Apply dates</button><button type="button" className="btn-secondary" onClick={() => setParams({})}>Clear filters</button><button type="button" className="btn-secondary" onClick={request.refresh} disabled={request.loading}>Refresh</button>
        </form><p className="text-xs text-zinc-400">Lecture dates are inclusive in Asia/Kolkata. Decisions never change the original marked time.</p></section>
        <State request={request} />{data && <section className="card p-4 space-y-4">{!data.items.length ? <p className="text-zinc-400">No correction requests match these filters.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-zinc-400"><tr><th className="p-2">Course / lecture</th>{role !== 'student' && <th className="p-2">Student</th>}<th className="p-2">Requested change</th><th className="p-2">State / submitted</th><th className="p-2">Details</th></tr></thead><tbody>{data.items.map(r => <tr key={r.id} className="border-t border-zinc-800"><td className="p-2">{r.course?.code} · {r.course?.name}<span className="block text-zinc-400">{r.term?.name} · {r.classGroup?.label} {r.classGroup?.section}</span><span className="block">{campus(r.scheduledStart)}</span></td>{role !== 'student' && <td className="p-2">{r.student?.name || 'Unavailable profile'}<span className="block text-zinc-400">{r.student?.studentId}</span></td>}<td className="p-2 capitalize">{r.originalStatus} → {r.requestedStatus}</td><td className="p-2">{labels[r.state]}<span className="block text-zinc-400">{campus(r.submittedAt)}</span>{r.routeReason && <span className="block text-xs">{r.routeReason}</span>}</td><td className="p-2"><Link className="underline" to={detailLink(r)}>{r.canReview ? 'Review request' : 'View request'}</Link></td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap gap-3 items-center"><button className="btn-secondary" disabled={data.pagination.page <= 1} onClick={() => update('page', String(data.pagination.page - 1))}>Previous</button><span>Page {data.pagination.page} of {Math.max(1, data.pagination.pages)} · {data.pagination.total} requests</span><button className="btn-secondary" disabled={data.pagination.page >= data.pagination.pages} onClick={() => update('page', String(data.pagination.page + 1))}>Next</button></div></section>}
    </Shell>;
}
export function CorrectionSession() {
    const { sessionId } = useParams(), navigate = useNavigate(), request = useRequest(sessionPath(sessionId));
    const [requestedStatus, setRequestedStatus] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const generation = useRef(0); useEffect(() => { generation.current++; setRequestedStatus(''); setReason(''); setError(''); setBusy(false); return () => { generation.current++; }; }, [sessionId]);
    async function submit(e) {
        e.preventDefault(); if (busy) return; setBusy(true); setError(''); const current = generation.current;
        try { const { data } = await api.post(sessionPath(sessionId), { requestedStatus, reason }); if (current === generation.current) navigate(detailLink(data.item), { replace: true }); }
        catch (e) { if (current === generation.current) { setError(errorText(e)); request.refresh(); } }
        finally { if (current === generation.current) setBusy(false); }
    }
    const data = request.data;
    return <Shell><h2 className="text-xl font-semibold">Request correction</h2><Link className="underline" to={'/academic/sessions/' + sessionId}>View own lecture attendance</Link><State request={request} />{error && <p role="alert" className="text-red-300">{error}</p>}{data && <>
        <section className="card p-5 space-y-3"><Context item={data.session} /><p className="capitalize">Current status: {data.currentStatus || 'Unavailable'} · {data.session.state} · {data.session.finalised ? 'Finalised' : 'Unfinalised'}</p>
            {data.pending ? <div className="space-y-2"><p>A request is already awaiting review: {labels[data.pending.state]}.</p><Link className="btn-secondary inline-block" to={detailLink({ ...data.pending, sessionId })}>View pending request</Link></div> : !data.eligibility.available ? <p role="status" className="text-amber-300">{data.eligibility.reason}</p> : <form className="space-y-4" onSubmit={submit}>
                <label className="block">Requested status<select className={field} required value={requestedStatus} disabled={busy} onChange={e => setRequestedStatus(e.target.value)}><option value="">Choose a different status</option>{['present', 'absent', 'late'].filter(s => s !== data.currentStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                <label className="block">Reason for correction<textarea className={field} required minLength={5} maxLength={1000} rows={4} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label><p className="text-sm text-zinc-400">Explain the attendance discrepancy in 5–1000 characters. Do not include medical details or sensitive attachments. Staff will review this request; submitting it does not change attendance.</p>
                <p className="text-sm">Review route: {data.reviewRoute === 'admin' ? 'Admin' : 'Original teaching Teacher'}{data.routeReason ? ' — ' + data.routeReason : ''}</p><button className="btn-primary" disabled={busy || !requestedStatus}>{busy ? 'Submitting…' : 'Submit correction request'}</button>
            </form>}
        </section><section className="card p-5 space-y-3"><h3 className="font-semibold">This lecture’s correction history</h3>{!data.history.length ? <p className="text-zinc-400">No previous correction decisions.</p> : data.history.map(r => <div key={r.id} className="border-t border-zinc-800 pt-3"><Link className="underline" to={detailLink({ ...r, sessionId })}>{labels[r.state]} · {r.originalStatus} → {r.requestedStatus}</Link><p className="text-sm text-zinc-400">{r.decisionReason}</p></div>)}</section>
    </>}</Shell>;
}
export function CorrectionDetail() {
    const { sessionId, requestId } = useParams(), { role } = useAuth(), request = useRequest(detailPath(sessionId, requestId));
    const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
    const generation = useRef(0); useEffect(() => { generation.current++; setReason(''); setError(''); setSuccess(''); setBusy(false); return () => { generation.current++; }; }, [sessionId, requestId]);
    async function act(action) {
        if (busy) return;
        if (action !== 'withdraw' && (reason.trim().length < 5 || reason.trim().length > 1000)) { setError('Provide a review reason of 5–1000 characters.'); return; }
        const current = generation.current; setBusy(true); setError(''); setSuccess('');
        try { await api.post(detailPath(sessionId, requestId) + '/' + action, action === 'withdraw' ? {} : { reason }); if (current === generation.current) { setSuccess('Request updated. The decision is recorded below.'); request.refresh(); notificationsChanged(); } }
        catch (e) { if (current === generation.current) { setError(!e.response || e.response.status >= 500 ? 'Could not confirm the action. Check the reloaded decision below before retrying.' : errorText(e)); request.refresh(); } }
        finally { if (current === generation.current) setBusy(false); }
    }
    const item = request.data?.item;
    return <Shell><h2 className="text-xl font-semibold">Correction request</h2><Link className="underline" to="/attendance-corrections">Back to correction history</Link>{error && <p role="alert" className="text-red-300">{error}</p>}{success && <p role="status">{success}</p>}<State request={request} />{item && <>
        <section className="card p-5 space-y-3"><Context item={item} /><p className="font-semibold">{labels[item.state]}</p><dl className="grid gap-3 sm:grid-cols-3">{[['Original status', item.originalStatus], ['Current status', item.currentStatus || 'Unavailable'], ['Requested status', item.requestedStatus]].map(([label, value]) => <div key={label}><dt className="text-sm text-zinc-400">{label}</dt><dd className="capitalize">{value}</dd></div>)}</dl>
            <p className="whitespace-pre-wrap break-words">Student reason: {item.studentReason}</p><p className="text-sm text-zinc-400">Submitted {campus(item.submittedAt)} · Originally marked {campus(item.originalMarkedAt)} via {item.originalMethod || 'Unavailable method'}</p>{item.correctedAt && <p className="text-sm">Attendance corrected {campus(item.correctedAt)}. Original marking provenance is preserved.</p>}
            {item.routeReason && <p>Admin routing / escalation: {item.routeReason}</p>}{item.decisionReason && <p className="whitespace-pre-wrap break-words">Decision: {item.decisionReason} · {item.reviewerRole} · {campus(item.decisionAt)}</p>}
            {item.state === 'stale' && role === 'student' && <Link className="btn-secondary inline-block" to={'/attendance-corrections/sessions/' + sessionId}>Review current attendance and correction options</Link>}
            {item.canWithdraw && <button className="btn-secondary" disabled={busy} onClick={() => act('withdraw')}>{busy ? 'Saving…' : 'Withdraw pending request'}</button>}
            {item.canReview && <div className="space-y-3 border-t border-zinc-800 pt-4"><label className="block">Review reason<textarea className={field} rows={3} minLength={5} maxLength={1000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label><p className="text-sm text-zinc-400">Required for every decision. Approval changes only the requested entry and appends an audit record.</p><div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={busy} onClick={() => act('approve')}>Approve correction</button><button className="btn-secondary" disabled={busy} onClick={() => act('reject')}>Reject request</button>{item.canEscalate && <button className="btn-secondary" disabled={busy} onClick={() => act('escalate')}>Escalate to Admin</button>}</div></div>}
            {!item.canReview && role !== 'student' && ['pending_teacher', 'escalated_admin'].includes(item.state) && <p className="text-sm text-zinc-400">Read-only in your current review scope.</p>}
        </section>
        <section className="card p-5 space-y-3"><h3 className="font-semibold">Request history</h3>{item.events.map((event, i) => <div key={i} className="border-t border-zinc-800 pt-3"><p>{labels[event.action] || event.action} · {event.actorRole} · {campus(event.at)}</p><p className="text-sm text-zinc-400 whitespace-pre-wrap break-words">{event.reason}</p></div>)}</section>
        <section className="card p-5 space-y-3"><h3 className="font-semibold">Attendance change audit</h3>{!item.audit.length ? <p className="text-zinc-400">This request has not changed attendance.</p> : item.audit.map(a => <div key={a.id} className="border-t border-zinc-800 pt-3"><p className="capitalize">{a.previousStatus} → {a.newStatus} · {a.actorRole} · {campus(a.at)}</p><p className="text-sm whitespace-pre-wrap break-words">{a.reason}</p><p className="text-xs text-zinc-400">Entry revision {a.previousEntryRevision} → {a.entryRevision} · Session revision {a.sessionRevision} · Original marked time {campus(a.originalMarkedAt)} / {a.originalMethod}</p></div>)}</section>
    </>}</Shell>;
}
