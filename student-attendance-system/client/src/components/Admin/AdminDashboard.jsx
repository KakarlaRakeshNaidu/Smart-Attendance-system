import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, UserCheck, ClipboardCheck, ShieldCheck, User } from 'lucide-react';
import api from '../../services/api';
import { PageHeader } from '../common/Interface';
import PageSkeleton from '../common/PageSkeleton';
export default function AdminDashboard() {
    const [stats, setStats] = useState(null),
        [loading, setLoading] = useState(true),
        [error, setError] = useState('');
    useEffect(() => {
        let current = true;
        api.get('/admin/stats')
            .then((r) => {
                if (current && r.data.success) setStats(r.data.stats);
            })
            .catch((e) => {
                if (current)
                    setError(e.response?.data?.message || 'Could not load the institution overview.');
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, []);
    if (loading) return <PageSkeleton />;
    const metrics = [
        ['Active teachers', stats?.totalTeachers, '/admin/teachers'],
        ['Active students', stats?.totalStudents, '/admin/students'],
        ["Today's sessions", stats?.todayAttendanceCount, '/admin/attendance'],
        ['Recent actions', stats?.recentAuditLogs?.length ?? 0, '/admin/audit-logs']
    ];
    return (
        <div className="page-stack">
            <PageHeader
                title="Administration overview"
                description="People, attendance, and academic operations across your institution"
            />
            {error && (
                <p role="alert" className="status-note text-red-400">
                    {error}
                </p>
            )}
            <div className="metric-grid">
                {metrics.map(([label, value, to]) => (
                    <Link className="card hover:border-zinc-600" key={label} to={to}>
                        <p className="text-sm text-zinc-400">{label}</p>
                        <p className="stat-value mt-3">{value ?? '—'}</p>
                        <p className="field-hint mt-3 inline-flex gap-2 items-center">
                            View records
                            <ArrowRight size={14} />
                        </p>
                    </Link>
                ))}
            </div>
            <section className="card">
                <header className="mb-6">
                    <h2>Quick actions</h2>
                    <p className="field-hint mt-2">Open the records you manage most often</p>
                </header>
                <div className="admin-shortcuts">
                    {[
                        ['/admin/teachers', 'Teachers', 'Faculty and batch access', UserCheck],
                        ['/admin/students', 'Students', 'Student records and accounts', Users],
                        [
                            '/admin/attendance',
                            'Attendance',
                            'Institution-wide lecture records',
                            ClipboardCheck
                        ],
                        ['/admin/audit-logs', 'Audit logs', 'Administrative changes', ShieldCheck],
                        ['/admin/profile', 'Profile', 'Your administrator account', User]
                    ].map(([to, title, detail, Icon]) => (
                        <Link key={to} to={to}>
                            <Icon size={18} />
                            <div>
                                <h3>{title}</h3>
                                <p className="field-hint mt-1">{detail}</p>
                            </div>
                            <ArrowRight size={16} className="ml-auto text-zinc-400" />
                        </Link>
                    ))}
                </div>
            </section>
            <section className="card !p-0">
                <header className="section-heading-row">
                    <div>
                        <h2>Recent activity</h2>
                        <p className="field-hint mt-2">The latest saved administrative actions</p>
                    </div>
                    <Link to="/admin/audit-logs" className="text-sm text-primary">
                        View audit log
                        <ArrowRight size={16} className="inline ml-2" />
                    </Link>
                </header>
                {stats?.recentAuditLogs?.length ? (
                    <ol className="activity-list">
                        {stats.recentAuditLogs.map((log) => (
                            <li key={log.id || log._id}>
                                <span className="activity-marker" />
                                <div className="min-w-0">
                                    <p className="text-sm capitalize">
                                        {log.action?.replaceAll('_', ' ').toLowerCase()}
                                    </p>
                                    <p className="field-hint mt-1">
                                        {log.actorName} · {log.targetModel || 'Account record'}
                                    </p>
                                </div>
                                <time className="field-hint ml-auto text-right">
                                    {new Date(log.createdAt).toLocaleString('en-IN', {
                                        timeZone: 'Asia/Kolkata',
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </time>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="p-6 text-sm text-zinc-400">
                        Administrative activity will appear here as records change
                    </p>
                )}
            </section>
        </div>
    );
}
