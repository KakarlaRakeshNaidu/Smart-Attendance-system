import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import service from '../../services/batchAttendanceService';
import toast from 'react-hot-toast';
export default function BatchSessions({ selectedBatch, refreshKey, onChange }) {
    const [sessions, setSessions] = useState([]),
        [busy, setBusy] = useState(''),
        [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setError('');
        if (!selectedBatch) {
            setSessions([]);
            return;
        }
        service
            .getTodayAttendance(selectedBatch)
            .then((r) => {
                if (active) setSessions(r.sessions || []);
            })
            .catch((e) => {
                if (active) setError(e.response?.data?.message || 'Could not load today’s sessions.');
            });
        return () => {
            active = false;
        };
    }, [selectedBatch, refreshKey]);
    async function finalise(session) {
        if (
            !window.confirm(
                'Finalise this session? Remaining unmarked students will become absent. Changes after finalisation require a correction.'
            )
        )
            return;
        setBusy(session.id);
        try {
            await api.post('/academic/sessions/' + session.id + '/finalise');
            toast.success('Session finalised. Analytics and reports now include these marks.');
            onChange();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Could not finalise.');
        } finally {
            setBusy('');
        }
    }
    return (
        <section className="card p-4 space-y-3">
            <div>
                <h2 className="font-semibold">Today’s batch sessions</h2>
                <p className="text-xs text-zinc-400 mt-1">
                    Save marks, then finalise the session to include it in percentages, alerts and semester
                    reports.
                </p>
            </div>
            {error && (
                <p role="alert" className="text-red-400">
                    {error}
                </p>
            )}
            {!sessions.length && !error && (
                <p className="text-sm text-zinc-400">
                    A session appears after you record attendance for this batch.
                </p>
            )}
            {sessions.map((s) => (
                <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3"
                >
                    <div className="text-sm">
                        <Link className="underline" to={'/academic/sessions/' + s.id}>
                            {s.subjectName}
                        </Link>
                        <span className="text-zinc-400">
                            {' '}
                            · {s.records.length} marked ·{' '}
                            {s.finalised ? 'Finalised' : s.state === 'cancelled' ? 'Cancelled' : 'Draft'}
                        </span>
                    </div>
                    {!s.finalised && s.state === 'scheduled' && (
                        <button disabled={!!busy} onClick={() => finalise(s)} className="btn-primary">
                            {busy === s.id ? 'Finalising…' : 'Finalise session'}
                        </button>
                    )}
                </div>
            ))}
        </section>
    );
}
