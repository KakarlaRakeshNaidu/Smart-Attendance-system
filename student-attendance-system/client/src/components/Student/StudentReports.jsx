import React, { useEffect, useState } from 'react';
import { Download, ArrowRight, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import api from '../../services/api';
import { PageHeader } from '../common/Interface';
import PageSkeleton from '../common/PageSkeleton';
const campusDate = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const attended = (status) => ['present', 'late'].includes(status);
export default function StudentReports() {
    const [data, setData] = useState([]),
        [profile, setProfile] = useState(null),
        [loading, setLoading] = useState(true),
        [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        Promise.all([api.get('/student/attendance'), api.get('/student/profile')])
            .then(([attendance, student]) => {
                if (active) {
                    setData(attendance.data.attendance || []);
                    setProfile(student.data.student || null);
                }
            })
            .catch((e) => {
                if (active) setError(e.response?.data?.message || 'Could not load your attendance report.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);
    if (loading) return <PageSkeleton />;
    const totalConducted = data.reduce((sum, item) => sum + (item.totalSessions || 0), 0),
        totalAttended = data.reduce((sum, item) => sum + (item.attended || 0), 0),
        incomplete = data.some((item) => item.dataQuality);
    const percentage =
        totalConducted && !incomplete ? Math.round((totalAttended * 100) / totalConducted) : null;
    const sessions = data.flatMap((item) =>
        (item.records || []).map((record) => ({
            ...record,
            subjectName: item.enrollment?.subject?.name || 'Subject',
            subjectCode: item.enrollment?.subject?.code || '',
            className: item.enrollment?.class?.name || ''
        }))
    );
    const missed = sessions.filter((record) => record.status === 'absent'),
        faceCount = sessions.filter((record) => record.source === 'face').length;
    const evaluated = data.filter((item) => item.totalSessions > 0),
        low = evaluated.filter((item) => item.belowThreshold),
        targets = [
            ...new Set(
                evaluated
                    .map((item) => item.threshold)
                    .filter((value) => typeof value === 'number' && value > 0)
            )
        ];
    let guidance = !totalConducted
        ? 'No completed, finalised lectures are available yet.'
        : targets.length !== 1
          ? 'Minimums vary by academic term. Review the subject records below.'
          : '';
    if (totalConducted && targets.length === 1 && !incomplete) {
        const target = targets[0] / 100;
        if (totalAttended < target * totalConducted) {
            const needed = Math.ceil((target * totalConducted - totalAttended) / (1 - target));
            guidance =
                target === 1
                    ? 'The 100% minimum cannot be reached by adding attended classes after an absence.'
                    : `Attend the next ${needed} lecture${needed === 1 ? '' : 's in a row'} to reach ${targets[0]}% overall attendance. Each subject is assessed separately.`;
        } else {
            const available = Math.floor(totalAttended / target - totalConducted);
            guidance =
                available > 0
                    ? `${available} additional missed lecture${available === 1 ? '' : 's'} would keep your overall attendance at or above ${targets[0]}%. Each subject is assessed separately.`
                    : `Your overall attendance meets the ${targets[0]}% minimum. Each subject is assessed separately.`;
        }
    }
    if (incomplete)
        guidance =
            'Some finalised records are incomplete. Percentages are unavailable until staff review the data.';
    const months = new Map();
    for (const record of sessions) {
        const day = campusDate(record.date),
            key = day.slice(0, 7);
        if (!months.has(key)) months.set(key, { key, conducted: 0, attended: 0 });
        const month = months.get(key);
        month.conducted++;
        if (attended(record.status)) month.attended++;
    }
    const monthly = [...months.values()]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((month) => ({
            ...month,
            label: new Date(month.key + '-15T12:00:00+05:30').toLocaleDateString('en-IN', {
                month: 'short',
                year: '2-digit',
                timeZone: 'Asia/Kolkata'
            }),
            percentage: Math.round((month.attended * 100) / month.conducted)
        }));
    function download() {
        const headers = [
            'Date',
            'Subject',
            'Subject code',
            'Class',
            'Session',
            'Status',
            'Method',
            'Teacher'
        ];
        const rows = sessions.map((record) => [
            campusDate(record.date),
            record.subjectName,
            record.subjectCode,
            record.className,
            record.sessionLabel,
            record.status,
            record.source,
            record.teacherName
        ]);
        const cell = (value) => {
            const text = String(value ?? '');
            return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
        };
        const blob = new Blob(
            ['\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')],
            { type: 'text/csv;charset=utf-8;' }
        );
        const url = URL.createObjectURL(blob),
            link = document.createElement('a');
        link.href = url;
        link.download = `Attendance_Report_${profile?.studentId || 'Student'}_${campusDate(new Date())}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }
    return (
        <div className="page-stack">
            <PageHeader
                title="Attendance report"
                description={
                    profile
                        ? `${profile.name} · ${profile.studentId}`
                        : 'Your subject records and monthly attendance'
                }
                actions={
                    <button className="btn-primary" onClick={download} disabled={!sessions.length || !!error}>
                        <Download size={16} />
                        Download CSV
                    </button>
                }
            />
            {error && (
                <p className="status-note text-red-400" role="alert">
                    {error}
                </p>
            )}
            <div className="attention-note">
                <AlertCircle size={18} />
                <div>
                    <p>
                        {incomplete
                            ? 'Attendance data needs review'
                            : !totalConducted
                              ? 'No completed sessions'
                              : low.length
                                ? `${low.length} ${low.length === 1 ? 'subject below its' : 'subjects below their'} attendance minimum`
                                : 'Attendance minimums met'}
                    </p>
                    <p className="text-sm text-zinc-400 mt-2">{guidance}</p>
                </div>
            </div>
            <div className="metric-grid">
                {[
                    [
                        'Overall attendance',
                        percentage === null ? '—' : percentage + '%',
                        'Present and late / completed sessions'
                    ],
                    [
                        'Lectures attended',
                        `${totalAttended} / ${totalConducted}`,
                        'Across your completed subject records'
                    ],
                    ['Face recognition marks', faceCount, 'Marks recorded with face recognition'],
                    ['Manual marks', sessions.length - faceCount, 'Other saved attendance marks']
                ].map(([label, value, detail]) => (
                    <div className="card" key={label}>
                        <p className="text-sm text-zinc-400">{label}</p>
                        <p className="stat-value mt-3">{value}</p>
                        <p className="field-hint mt-3">{detail}</p>
                    </div>
                ))}
            </div>
            <section className="card !p-0">
                <header className="section-heading-row">
                    <div>
                        <h2>Attendance by subject</h2>
                        <p className="field-hint mt-2">
                            Each subject uses its academic term’s configured minimum
                        </p>
                    </div>
                    <Link className="text-sm text-primary whitespace-nowrap" to="/semester-reports">
                        Semester reports
                        <ArrowRight size={16} className="inline ml-2" />
                    </Link>
                </header>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead>
                            <tr>
                                {['Subject', 'Attended / held', 'Absent', 'Minimum', 'Attendance'].map(
                                    (label) => (
                                        <th key={label} className="text-left">
                                            {label}
                                        </th>
                                    )
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item) => (
                                <tr key={item.enrollment?.id} className="border-t border-zinc-800">
                                    <td>
                                        <p className="font-mono text-xs text-zinc-400">
                                            {item.enrollment?.subject?.code}
                                        </p>
                                        <p className="mt-1">{item.enrollment?.subject?.name}</p>
                                        <p className="field-hint mt-1">{item.enrollment?.class?.name}</p>
                                    </td>
                                    <td className="tabular-nums">
                                        {item.attended} / {item.totalSessions}
                                    </td>
                                    <td className="tabular-nums">{item.missed}</td>
                                    <td>{item.threshold == null ? '—' : item.threshold + '%'}</td>
                                    <td>
                                        <span className="font-medium tabular-nums">
                                            {item.percentage == null ? '—' : item.percentage + '%'}
                                        </span>
                                        <p
                                            className={
                                                'field-hint mt-1 ' +
                                                (item.belowThreshold ? 'text-amber-400' : '')
                                            }
                                        >
                                            {item.dataQuality
                                                ? 'Incomplete data'
                                                : !item.totalSessions
                                                  ? 'No completed sessions'
                                                  : item.belowThreshold
                                                    ? 'Below minimum'
                                                    : 'Minimum met'}
                                        </p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!data.length && (
                        <p className="p-6 text-sm text-zinc-400">No subject records are available yet</p>
                    )}
                </div>
            </section>
            <section className="card">
                <h2>Monthly attendance trend</h2>
                <p className="field-hint mt-2 mb-6">
                    Completed, finalised lecture records · late counts as attended
                </p>
                {monthly.length ? (
                    <>
                        <div className="h-72">
                            <ResponsiveContainer
                                initialDimension={{ width: 640, height: 280 }}
                                minWidth={0}
                                width="100%"
                                height="100%"
                            >
                                <AreaChart
                                    data={monthly}
                                    margin={{ top: 8, right: 16, bottom: 0, left: -12 }}
                                >
                                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                                    <YAxis
                                        domain={[0, 100]}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(value) => value + '%'}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'var(--chart-tooltip-bg)',
                                            border: '1px solid var(--chart-tooltip-border)',
                                            borderRadius: 8,
                                            color: 'var(--chart-tooltip-text)'
                                        }}
                                        formatter={(value) => [value + '%', 'Attended']}
                                    />
                                    <Area
                                        dataKey="percentage"
                                        type="monotone"
                                        stroke="var(--chart)"
                                        fill="var(--chart)"
                                        fillOpacity={0.08}
                                        strokeWidth={2}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-5 border-t border-zinc-800 pt-5">
                            {monthly.map((month) => (
                                <p key={month.key} className="text-xs text-zinc-400">
                                    <span className="font-mono text-zinc-100">{month.label}</span> ·{' '}
                                    {month.attended} / {month.conducted} attended
                                </p>
                            ))}
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-zinc-400">
                        The monthly trend appears after your first finalised lecture
                    </p>
                )}
            </section>
            <section className="card !p-0">
                <header className="section-heading-row">
                    <h2>Absence log</h2>
                    <span className="font-mono text-xs text-zinc-400">{missed.length} missed</span>
                </header>
                {missed.length ? (
                    <div className="max-h-96 overflow-auto">
                        <table className="w-full min-w-[560px]">
                            <thead>
                                <tr>
                                    {['Lecture date', 'Subject', 'Class', 'Teacher'].map((label) => (
                                        <th className="text-left" key={label}>
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {missed.map((record, index) => (
                                    <tr
                                        className="border-t border-zinc-800"
                                        key={(record.id || record.sessionId || index) + record.subjectCode}
                                    >
                                        <td className="font-mono text-xs whitespace-nowrap">
                                            {new Date(record.date).toLocaleDateString('en-IN', {
                                                timeZone: 'Asia/Kolkata',
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </td>
                                        <td>{record.subjectName}</td>
                                        <td>{record.className}</td>
                                        <td>{record.teacherName || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="p-6 text-sm text-zinc-400">No absences in your completed lecture records</p>
                )}
            </section>
        </div>
    );
}
