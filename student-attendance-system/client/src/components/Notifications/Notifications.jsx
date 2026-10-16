import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import api from '../../services/api';
import { StudentShell } from '../Student/StudentPortalPages';
import { notificationsChanged } from './notificationState';
const errorMessage = e => e.response?.data?.message || 'Notifications are unavailable. Please retry.';
const campus = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—';
function Inbox() {
    const { role, user } = useAuth();
    const [params, setParams] = useSearchParams(), [version, setVersion] = useState(0);
    const [state, setState] = useState({ loading: true, data: null, error: '' });
    const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [success, setSuccess] = useState('');
    const revision = useRef(0), query = params.toString();
    const refresh = useCallback(() => setVersion(v => v + 1), []);
    useEffect(() => {
        const controller = new AbortController(); let active = true; revision.current++;
        setState({ loading: true, data: null, error: '' });
        api.get('/notifications?' + query, { signal: controller.signal, timeout: 20000 }).then(r => { if (active) setState({ loading: false, data: r.data, error: '' }); }).catch(e => { if (active && !controller.signal.aborted) setState({ loading: false, data: null, error: errorMessage(e) }); });
        return () => { active = false; revision.current++; controller.abort(); };
    }, [query, version, user?.id]);
    useEffect(() => {
        const storage = e => { if (e.key === 'notifications:changed') refresh(); };
        window.addEventListener('focus', refresh); window.addEventListener('storage', storage); window.addEventListener('notifications:changed', refresh);
        return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', storage); window.removeEventListener('notifications:changed', refresh); };
    }, [refresh]);
    async function mark(id) {
        if (busy) return;
        setBusy(true); setActionError(''); setSuccess('');
        const current = revision.current;
        try { await api.patch('/notifications/' + (id ? id + '/read' : 'read-all'), {}); notificationsChanged(); if (current === revision.current) setSuccess(id ? 'Notification marked as read.' : 'Your notifications marked as read.'); }
        catch (e) { if (current === revision.current) setActionError(errorMessage(e)); }
        finally { setBusy(false); }
    }
    const update = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
    const data = state.data, pagination = data?.pagination;
    const Heading = role === 'student' ? 'h2' : 'h1';
    return <div className="space-y-5">
        <header><Heading className="text-2xl font-semibold">Notifications</Heading><p className="text-sm text-zinc-400 mt-2">Saved attendance evaluations using each term’s application minimum. Reading a notification does not resolve attendance.</p></header>
        <p className="text-sm text-zinc-400">{role === 'teacher' ? 'Based on lectures you taught. These figures can differ from a Student’s full-course attendance.' : 'Based on your eligible completed, finalised lectures for the entire course offering.'} Late counts as attended. These are evaluated snapshots, not an official examination decision.</p>
        <div className="card p-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">Status<select aria-label="Notification status" className="block mt-1 rounded-xl border border-zinc-700 bg-zinc-900 p-2" value={params.get('status') || ''} onChange={e => update('status', e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="resolved">Resolved</option><option value="unavailable">Evaluation unavailable</option></select></label>
            <label className="text-sm">Read state<select aria-label="Notification read state" className="block mt-1 rounded-xl border border-zinc-700 bg-zinc-900 p-2" value={params.get('unread') || ''} onChange={e => update('unread', e.target.value)}><option value="">All notifications</option><option value="true">Unread</option><option value="false">Read</option></select></label>
            <button className="btn-secondary" onClick={refresh} disabled={state.loading}>Refresh</button><button className="btn-secondary" onClick={() => mark()} disabled={busy || state.loading}>Mark all as read</button>
        </div>
        {actionError && <p role="alert" className="text-red-300">{actionError}</p>}{success && <p role="status">{success}</p>}
        {state.loading && <p role="status">Loading notifications…</p>}
        {state.error && <div role="alert" className="card p-5"><p>{state.error}</p><button className="btn-secondary mt-3" onClick={refresh}>Retry</button></div>}
        {data && !data.items.length && <p className="card p-5 text-zinc-400">No notifications match these filters.</p>}
        {data?.items.map(n => {
            const o = n.offeringId, link = new URLSearchParams({ offeringId: o?._id || '' });
            if (role === 'teacher' && n.studentId?._id) link.set('studentId', n.studentId._id);
            return <article key={n._id} className="card p-5 space-y-3">
                <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">{o?.courseId?.code} · {o?.courseId?.name || 'Unavailable course'}</h2><span>{n.readAt ? 'Read' : 'Unread'} · {n.status === 'unavailable' ? 'Evaluation unavailable' : n.status === 'active' ? 'Active' : 'Resolved'}</span></div>
                <p className="text-sm text-zinc-400">{n.termId?.name || 'Unavailable term'} · {o?.classGroupId?.label} {o?.classGroupId?.section}</p>
                {role === 'teacher' && <p>{n.studentId?.name || 'Unavailable Student'} · {n.studentId?.studentId}<span className="block text-sm text-zinc-400">Based on lectures you taught</span></p>}
                <p>{n.status === 'unavailable' ? 'Current percentage unavailable' : n.percentage === null ? 'Percentage unavailable' : `${n.percentage}% (${n.attended}/${n.eligible} eligible sessions attended)`} · Evaluated term minimum: {n.minimum ?? 'Unavailable'}{n.minimum != null && '%'}</p>
                <p className="text-sm">{n.reason}</p><p className="text-xs text-zinc-400">Attendance snapshot {campus(n.snapshotAt)} · Evaluated {campus(n.evaluatedAt)} (Asia/Kolkata){n.resolvedAt && ` · Resolved ${campus(n.resolvedAt)}`}</p>
                <div className="flex flex-wrap gap-3">{!n.readAt && <button className="btn-secondary" disabled={busy} onClick={() => mark(n._id)}>Mark as read</button>}{o && <Link className="btn-secondary" to={'/attendance-analytics?' + link}>View attendance analytics</Link>}</div>
            </article>;
        })}
        {pagination && <div className="flex flex-wrap items-center gap-4"><button className="btn-secondary" disabled={pagination.page <= 1 || state.loading} onClick={() => update('page', String(pagination.page - 1))}>Previous</button><span>Page {pagination.page} of {Math.max(1, pagination.pages)} · {pagination.total} notifications</span><button className="btn-secondary" disabled={pagination.page >= pagination.pages || state.loading} onClick={() => update('page', String(pagination.page + 1))}>Next</button></div>}
    </div>;
}
export default function Notifications() {
    const { role } = useAuth();
    return role === 'student' ? <StudentShell title="Notifications"><Inbox /></StudentShell> : <Inbox />;
}
