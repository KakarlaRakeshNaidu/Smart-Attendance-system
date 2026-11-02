import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import api from '../../services/api';
export default function SessionHistory() {
    const [sessions, setSessions] = useState([]),
        [error, setError] = useState('');
    useEffect(() => {
        let current = true;
        api.get('/attendance', { params: { source: 'sessions' } })
            .then((response) => {
                if (current) setSessions((response.data.attendance || []).slice(0, 7));
            })
            .catch((e) => {
                if (current) setError(e.response?.data?.message || 'Could not load lecture history.');
            });
        return () => {
            current = false;
        };
    }, []);
    const trend = [...sessions].reverse().map((s) => ({
        label: new Date(s.date).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'short'
        }),
        present: s.records.filter((r) => ['present', 'late'].includes(r.status)).length,
        absent: s.records.filter((r) => r.status === 'absent').length
    }));
    return (
        <section className="grid gap-5 xl:grid-cols-2">
            <div className="card p-5">
                <h2 className="font-semibold mb-4">Attendance Trend</h2>
                <p className="text-sm text-zinc-400 mb-3">
                    Last seven lectures; late marks count as attended.
                </p>
                {error && (
                    <p role="alert" className="text-red-400">
                        {error}
                    </p>
                )}
                {trend.length ? (
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend}>
                                <XAxis dataKey="label" stroke="var(--chart-axis)" />
                                <YAxis allowDecimals={false} stroke="var(--chart-axis)" />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--chart-tooltip-bg)',
                                        borderColor: 'var(--chart-tooltip-border)',
                                        color: 'var(--chart-tooltip-text)'
                                    }}
                                />
                                <Area
                                    dataKey="present"
                                    name="Present or late"
                                    stroke="#10b981"
                                    fill="#10b981"
                                    fillOpacity={0.15}
                                />
                                <Area
                                    dataKey="absent"
                                    name="Absent"
                                    stroke="#f43f5e"
                                    fill="#f43f5e"
                                    fillOpacity={0.1}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    !error && <p className="text-sm text-zinc-400">No lecture history yet.</p>
                )}
            </div>
            <div className="card p-5">
                <h2 className="font-semibold mb-4">Recent Attendance</h2>
                <div className="space-y-3">
                    {sessions.map((s) => (
                        <Link
                            key={s.sessionId}
                            to={'/academic/sessions/' + s.sessionId}
                            className="block rounded-xl border border-zinc-800 p-3"
                        >
                            <p className="text-sm font-medium">{s.subject || 'Lecture'}</p>
                            <p className="text-xs text-zinc-400 mt-1">
                                {new Date(s.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} ·{' '}
                                {s.finalised ? 'Finalised' : s.state === 'cancelled' ? 'Cancelled' : 'Draft'}{' '}
                                · {s.records.length} students
                            </p>
                        </Link>
                    ))}
                    {!sessions.length && !error && (
                        <p className="text-sm text-zinc-400">Completed and draft sessions appear here.</p>
                    )}
                </div>
            </div>
        </section>
    );
}
