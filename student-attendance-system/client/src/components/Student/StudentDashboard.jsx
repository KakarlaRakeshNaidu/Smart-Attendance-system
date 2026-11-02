import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { PageHeader } from '../common/Interface';
import PageSkeleton from '../common/PageSkeleton';
export default function StudentDashboard() {
    const [summary, setSummary] = useState(null),
        [loading, setLoading] = useState(true),
        [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        api.get('/student/attendance/summary')
            .then((r) => {
                if (active && r.data.success) setSummary(r.data.summary);
            })
            .catch((e) => {
                if (active) setError(e.response?.data?.message || 'Could not load your attendance.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);
    if (loading) return <PageSkeleton />;
    const subjects = summary?.subjects || [],
        low = subjects.filter((s) => s.belowThreshold);
    return (
        <div className="page-stack">
            <PageHeader
                title="Attendance overview"
                description="Your course attendance, from completed lectures"
                actions={
                    <Link to="/student/reports" className="btn-secondary">
                        Open attendance report
                        <ArrowRight size={16} />
                    </Link>
                }
            />
            {error && (
                <p role="alert" className="status-note text-red-400">
                    {error}
                </p>
            )}
            <div className="metric-grid">
                {[
                    [
                        'Overall attendance',
                        summary?.overallPercentage == null ? '—' : summary.overallPercentage + '%',
                        'Weighted across completed lectures'
                    ],
                    ['Lectures held', summary?.totalConducted ?? 0, 'Finalised sessions in your roster'],
                    ['Lectures attended', summary?.totalAttended ?? 0, 'Present and late marks combined'],
                    ['Below minimum', low.length, 'Subjects needing your attention']
                ].map(([label, value, detail]) => (
                    <div className="card" key={label}>
                        <p className="text-sm text-zinc-400">{label}</p>
                        <p className="stat-value mt-3">{value}</p>
                        <p className="field-hint mt-3">{detail}</p>
                    </div>
                ))}
            </div>
            {low.length > 0 && (
                <div className="attention-note">
                    <AlertCircle size={18} />
                    <div>
                        <p>
                            {low.length} {low.length === 1 ? 'subject is' : 'subjects are'} below the
                            attendance minimum
                        </p>
                        <p className="text-sm text-zinc-400 mt-1">
                            Review the course record and its academic term minimum
                        </p>
                    </div>
                    <Link to="/attendance-analytics" className="text-sm text-primary ml-auto shrink-0">
                        Review analytics
                        <ArrowRight size={16} className="inline ml-2" />
                    </Link>
                </div>
            )}
            <section className="card !p-0">
                <header className="section-heading-row">
                    <div>
                        <h2>Your subjects</h2>
                        <p className="field-hint mt-2">Course and term records stay separate</p>
                    </div>
                    <Link to="/student/attendance" className="text-sm text-primary">
                        View all
                        <ArrowRight size={16} className="inline ml-2" />
                    </Link>
                </header>
                {subjects.length ? (
                    <div className="course-register">
                        {subjects.map((s) => (
                            <Link
                                key={s.subjectId}
                                to="/student/attendance"
                                state={{ subjectId: s.subjectId }}
                                className="course-register-row"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-mono text-zinc-400">{s.subjectCode}</p>
                                    <h3 className="mt-1">{s.subjectName}</h3>
                                    <p className="field-hint mt-2">
                                        {s.className} · {s.academicSession}
                                    </p>
                                    {s.teacherName && <p className="field-hint mt-1">{s.teacherName}</p>}
                                </div>
                                <div>
                                    <p className="text-sm tabular-nums">
                                        {s.attended} / {s.conducted} attended
                                    </p>
                                    <p className="field-hint mt-2">{s.missed} absent</p>
                                </div>
                                <div className="min-w-0">
                                    <div className="attendance-track">
                                        <span style={{ width: (s.percentage ?? 0) + '%' }} />
                                    </div>
                                    <p
                                        className={
                                            'field-hint mt-2 ' + (s.belowThreshold ? 'text-amber-400' : '')
                                        }
                                    >
                                        {s.percentage == null
                                            ? 'No completed sessions'
                                            : s.belowThreshold
                                              ? `Below ${s.threshold}% minimum`
                                              : `Minimum ${s.threshold}%`}
                                    </p>
                                </div>
                                <span className="register-percentage">
                                    {s.percentage == null ? '—' : s.percentage + '%'}
                                </span>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="p-8 text-sm text-zinc-400">
                        Your enrolled subjects and attendance will appear here
                    </div>
                )}
            </section>
        </div>
    );
}
