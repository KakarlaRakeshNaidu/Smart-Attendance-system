import { PageHeader } from '../common/Interface';
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import studentService from '../../services/studentService';
import attendanceService, { isSessionMatchingBatch } from '../../services/batchAttendanceService';
import api from '../../services/api';
import {
    Users,
    ClipboardCheck,
    Calendar,
    Clock,
    ArrowUpRight,
    CheckCircle2,
    AlertCircle,
    Scan,
    Sparkles,
    ChevronRight,
    ShieldCheck,
    Layers,
    UserCheck,
    UserX,
    FileSpreadsheet
} from 'lucide-react';
import { SkeletonStatCards } from '../common/Skeleton';
import Card from '../common/Card';
import SessionHistory from './SessionHistory';

const formatAcademicYear = (yr) => {
    if (!yr) return '–';
    const num = parseInt(yr, 10);
    if (num === 1) return '1st Year';
    if (num === 2) return '2nd Year';
    if (num === 3) return '3rd Year';
    if (num === 4) return '4th Year';
    return `${num}th Year`;
};

const BRANCH_NAMES = {
    CSE: 'Computer Science',
    ECE: 'Electronics & Communication',
    ME: 'Mechanical Engineering',
    CE: 'Civil Engineering',
    EE: 'Electrical Engineering',
    IT: 'Information Technology'
};

const Dashboard = () => {
    const { user, teacher } = useAuth();
    const navigate = useNavigate();

    const [teacherAccess, setTeacherAccess] = useState([]);
    const [allStudents, setAllStudents] = useState([]);
    const [todaySessions, setTodaySessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTeacherDashboardData();
    }, [user]);

    const loadTeacherDashboardData = async () => {
        try {
            setLoading(true);
            const [accessRes, studentsRes, attendanceRes] = await Promise.all([
                user?.role === 'teacher'
                    ? api.get('/teacher/my-access').catch(() => ({ data: { access: [] } }))
                    : Promise.resolve({ data: { access: [] } }),
                studentService.getAllStudents().catch(() => ({ students: [] })),
                attendanceService.getTodayAttendance().catch(() => ({ sessions: [], attendance: [] }))
            ]);

            const accessList = accessRes.data?.access || [];
            const studentsList = studentsRes.students || [];
            const sessionsList = attendanceRes.sessions || attendanceRes.attendance || [];

            setTeacherAccess(accessList);
            setAllStudents(studentsList);
            setTodaySessions(sessionsList);
        } catch (error) {
            console.error('Error loading teacher dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate per-batch statistics and completion status
    const batchStats = useMemo(() => {
        // If user is an admin without explicit teacher batches, build pseudo-batches from student list
        let batches = teacherAccess;
        if ((!batches || batches.length === 0) && user?.role === 'admin') {
            const map = new Map();
            allStudents.forEach((s) => {
                const b = s.branch || 'CSE';
                const y = s.academicYear || 4;
                const sec = s.section || 'A';
                const sub = s.subsection || 'A1';
                const key = `${b}-${y}-${sec}-${sub}`;
                if (!map.has(key)) {
                    map.set(key, { id: key, branch: b, academicYear: y, section: sec, subsection: sub });
                }
            });
            batches = Array.from(map.values());
        }

        // Aggregate records from all sessions today
        const rawRecords = [];
        todaySessions.forEach((sess) => {
            (sess.records || []).forEach((rec) => {
                rawRecords.push({
                    ...rec,
                    sessionId: sess.id,
                    sessionClass: sess.className,
                    sessionSection: sess.section,
                    sessionSource: sess.source || 'manual'
                });
            });
        });

        // Compute stats for each batch
        return (batches || []).map((batch) => {
            // Find enrolled students in this batch
            const enrolledStudents = allStudents.filter((s) => {
                const matchYear =
                    !batch.academicYear || Number(s.academicYear) === Number(batch.academicYear);
                const matchBranch = !batch.branch || s.branch?.toUpperCase() === batch.branch.toUpperCase();
                const matchSection =
                    !batch.section ||
                    batch.section === 'ALL' ||
                    s.section?.toUpperCase() === batch.section.toUpperCase();
                const matchSub =
                    !batch.subsection ||
                    batch.subsection === 'ALL' ||
                    s.subsection?.toUpperCase() === batch.subsection.toUpperCase();
                return matchYear && matchBranch && matchSection && matchSub;
            });

            const enrolledIds = new Set(enrolledStudents.map((s) => s.id || s._id));
            const enrolledRolls = new Set(enrolledStudents.map((s) => s.studentId));

            // Find marked records from sessions matching THIS specific batch ONLY
            const batchSessions = todaySessions.filter((sess) => isSessionMatchingBatch(sess, batch));
            const batchRecords = [];
            batchSessions.forEach((sess) => {
                (sess.records || []).forEach((r) => {
                    const belongsToBatch = enrolledIds.has(r.studentId) || enrolledRolls.has(r.studentRollNo);
                    if (belongsToBatch) {
                        batchRecords.push({
                            ...r,
                            sessionId: sess.id,
                            sessionClass: sess.className,
                            sessionSection: sess.section,
                            sessionSource: sess.source || 'manual'
                        });
                    }
                });
            });

            // Deduplicate per student
            const dedupeMap = new Map();
            batchRecords.forEach((r) => {
                const key = r.studentRollNo || r.studentId;
                const existing = dedupeMap.get(key);
                if (!existing) {
                    dedupeMap.set(key, r);
                } else if (r.status === 'present' && existing.status !== 'present') {
                    dedupeMap.set(key, r);
                } else if (
                    new Date(r.markedAt) > new Date(existing.markedAt) &&
                    existing.status !== 'present'
                ) {
                    dedupeMap.set(key, r);
                }
            });

            const uniqueRecords = Array.from(dedupeMap.values());
            const presentCount = uniqueRecords.filter((r) => r.status === 'present').length;
            const absentCount = uniqueRecords.filter((r) => r.status === 'absent').length;
            const isMarked = uniqueRecords.length > 0;
            const latestMarkedTime =
                uniqueRecords.length > 0
                    ? new Date(Math.max(...uniqueRecords.map((r) => new Date(r.markedAt).getTime())))
                    : null;

            return {
                batch,
                enrolledCount: enrolledStudents.length,
                enrolledStudents,
                isMarked,
                presentCount,
                absentCount,
                records: uniqueRecords,
                latestMarkedTime
            };
        });
    }, [teacherAccess, allStudents, todaySessions, user]);

    // Overall metrics calculated exclusively across teacher's assigned scope
    const summary = useMemo(() => {
        const totalBatches = batchStats.length;
        const completedBatches = batchStats.filter((b) => b.isMarked).length;
        const totalMyStudents = batchStats.reduce((sum, b) => sum + b.enrolledCount, 0);
        const totalPresent = batchStats.reduce((sum, b) => sum + b.presentCount, 0);
        const totalAbsent = batchStats.reduce((sum, b) => sum + b.absentCount, 0);
        const totalMarked = totalPresent + totalAbsent;
        const attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0;

        return {
            totalBatches,
            completedBatches,
            totalMyStudents,
            totalPresent,
            totalAbsent,
            attendanceRate
        };
    }, [batchStats]);

    // Recent activity list strictly from teacher's batches today
    const recentActivity = useMemo(() => {
        const list = [];
        batchStats.forEach((b) => {
            b.records.forEach((r) => {
                list.push({
                    ...r,
                    batchInfo: `${b.batch.branch}-${b.batch.section} (${b.batch.subsection})`
                });
            });
        });

        return list
            .sort((a, b) => new Date(b.markedAt).getTime() - new Date(a.markedAt).getTime())
            .slice(0, 6);
    }, [batchStats]);

    const handleLaunchAttendance = (batch, tab = 'face') => {
        navigate('/attendance', { state: { batch, tab } });
    };

    if (loading) {
        return (
            <div className="space-y-6 page-enter">
                <Card className="p-6">
                    <div className="h-7 w-64 bg-zinc-800 rounded " />
                    <div className="h-4 w-40 bg-zinc-800/60 rounded mt-2 " />
                </Card>
                <SkeletonStatCards />
            </div>
        );
    }

    return (
        <div className="space-y-6 page-enter">
            <PageHeader
                title="Teaching overview"
                description={
                    (teacher?.name || user?.name || 'Teacher') +
                    ' · ' +
                    new Date().toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                    })
                }
                actions={
                    <Link className="btn-primary" to="/attendance">
                        <ClipboardCheck size={16} />
                        Take attendance
                    </Link>
                }
            />
            <div className="metric-grid">
                {[
                    ['Assigned batches', summary.totalBatches, `${summary.completedBatches} completed today`],
                    ['My students', summary.totalMyStudents, 'Enrolled across your classes'],
                    ['Present today', summary.totalPresent, `${summary.totalAbsent} marked absent`],
                    [
                        "Today's progress",
                        `${summary.totalBatches ? Math.round((summary.completedBatches / summary.totalBatches) * 100) : 0}%`,
                        'Batches with saved attendance'
                    ]
                ].map(([label, value, detail]) => (
                    <div className="card" key={label}>
                        <p className="text-sm text-zinc-400">{label}</p>
                        <p className="stat-value mt-3">{value}</p>
                        <p className="field-hint mt-3">{detail}</p>
                    </div>
                ))}
            </div>
            {/* Primary Section: My Assigned Batches Hub */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <h2 className="text-lg font-medium text-white flex items-center gap-2">
                            <span>Assigned academic batches</span>
                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 font-mono">
                                {batchStats.length}
                            </span>
                        </h2>
                        <p className="text-xs text-zinc-400">
                            Record attendance and review the roster for each assigned batch
                        </p>
                    </div>

                    <Link
                        to="/students"
                        className="inline-flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        <span>View grouped directory</span>
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                {batchStats.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {batchStats.map(
                            ({
                                batch,
                                enrolledCount,
                                isMarked,
                                presentCount,
                                absentCount,
                                latestMarkedTime
                            }) => {
                                const branchName = BRANCH_NAMES[batch.branch] || batch.branch;

                                return (
                                    <div
                                        key={
                                            batch.id ||
                                            `${batch.branch}-${batch.academicYear}-${batch.section}-${batch.subsection}`
                                        }
                                        className="group rounded-xl border border-zinc-800 bg-zinc-900/90 p-5 transition-colors duration-200 hover:border-zinc-700 hover:shadow-lg  flex flex-col justify-between space-y-4"
                                    >
                                        {/* Batch Title Header */}
                                        <div className="space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 text-xs font-medium text-blue-300 font-mono">
                                                            {batch.branch}
                                                        </span>
                                                        <span className="text-xs font-medium text-zinc-300">
                                                            {formatAcademicYear(batch.academicYear)}
                                                        </span>
                                                    </div>
                                                    <h3 className="mt-2 text-base font-medium text-white group-hover:text-blue-400 transition-colors">
                                                        Section {batch.section} — batch {batch.subsection}
                                                    </h3>
                                                    <p className="text-xs text-zinc-500 mt-0.5">
                                                        {branchName}
                                                    </p>
                                                </div>

                                                {/* Status Badge */}
                                                {isMarked ? (
                                                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                                        Marked
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                                                        <AlertCircle className="h-4 w-4 text-amber-400" />
                                                        Pending
                                                    </span>
                                                )}
                                            </div>

                                            {/* Attendance Stats for this batch today */}
                                            <div className="pt-2 border-t border-zinc-800/80">
                                                <div className="flex items-center justify-between text-xs text-zinc-400">
                                                    <span>Enrolled Roster:</span>
                                                    <span className="font-medium text-zinc-200">
                                                        {enrolledCount}{' '}
                                                        {enrolledCount === 1 ? 'Student' : 'Students'}
                                                    </span>
                                                </div>

                                                {isMarked ? (
                                                    <div className="mt-2 flex items-center justify-between rounded-xl bg-zinc-950/70 p-3 border border-zinc-800 text-xs">
                                                        <div className="flex items-center gap-2 font-mono">
                                                            <span className="text-emerald-400 font-medium">
                                                                {presentCount} Present
                                                            </span>
                                                            <span className="text-zinc-600">•</span>
                                                            <span className="text-red-400 font-medium">
                                                                {absentCount} Absent
                                                            </span>
                                                        </div>
                                                        {latestMarkedTime && (
                                                            <span className="text-xs text-zinc-500 font-mono">
                                                                {latestMarkedTime.toLocaleTimeString([], {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-300/90 flex items-center gap-2">
                                                        <Clock className="h-4 w-4 text-amber-400 flex-shrink-0" />
                                                        <span>No attendance taken yet today</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="pt-2 flex items-center gap-2">
                                            <button
                                                onClick={() => handleLaunchAttendance(batch, 'face')}
                                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-blue-500 px-3 py-2 text-xs font-medium text-black transition-colors shadow-sm shadow-blue-600/20"
                                            >
                                                <Scan className="h-4 w-4" />
                                                <span>Take attendance</span>
                                            </button>

                                            {isMarked ? (
                                                <button
                                                    onClick={() => handleLaunchAttendance(batch, 'view')}
                                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors"
                                                    title="View Today's Attendance List"
                                                >
                                                    <ClipboardCheck className="h-4 w-4 text-emerald-400" />
                                                    <span>Today</span>
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleLaunchAttendance(batch, 'take')}
                                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors"
                                                    title="Manual Roll Call"
                                                >
                                                    <Users className="h-4 w-4 text-zinc-400" />
                                                    <span>Manual</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                        )}
                    </div>
                ) : (
                    <Card className="p-8 text-center border-dashed border-zinc-800">
                        <AlertCircle className="mx-auto h-12 w-12 text-amber-400/80 mb-3" />
                        <h3 className="text-base font-medium text-white">No batches assigned</h3>
                        <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                            The administration has not assigned any class sections or branches to your account
                            yet. Please contact the administrator to get batch access.
                        </p>
                    </Card>
                )}
            </div>

            {/* Quick Launch & Recent activity Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Quick Launch Action Cards (1 col) */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium   text-zinc-400">Quick actions</h2>

                    <button
                        onClick={() => navigate('/attendance', { state: { tab: 'face' } })}
                        className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 transition-colors hover:border-blue-500/50 hover:bg-zinc-800/80 group flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-blue-400 group- transition-transform">
                                <Scan className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Face recognition</h4>
                                <p className="text-xs text-zinc-400">
                                    Real-time batch-scoped biometric scanning
                                </p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-colors" />
                    </button>

                    <button
                        onClick={() => navigate('/attendance', { state: { tab: 'take' } })}
                        className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 transition-colors hover:border-emerald-500/50 hover:bg-zinc-800/80 group flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400 group- transition-transform">
                                <ClipboardCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Manual roll call</h4>
                                <p className="text-xs text-zinc-400">Present, late, and absent marking</p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-colors" />
                    </button>

                    <button
                        onClick={() => navigate('/attendance', { state: { tab: 'download' } })}
                        className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 transition-colors hover:border-purple-500/50 hover:bg-zinc-800/80 group flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-purple-400 group- transition-transform">
                                <FileSpreadsheet className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Download attendance report</h4>
                                <p className="text-xs text-zinc-400">
                                    Export clean CSV reports for your batches
                                </p>
                            </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-colors" />
                    </button>
                </div>

                {/* Today's Recent Marked Attendance Feed (2 cols) */}
                <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium   text-zinc-400">Today’s attendance</h2>
                        <Link
                            to="/attendance"
                            className="text-xs font-medium text-blue-400 hover:text-blue-300"
                        >
                            Open today tab
                        </Link>
                    </div>

                    <Card className="p-4 sm:p-5">
                        {recentActivity.length > 0 ? (
                            <div className="space-y-2.5">
                                {recentActivity.map((record, index) => (
                                    <div
                                        key={`${record.sessionId}-${record.id || index}`}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3 hover:bg-zinc-800/60 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-200">
                                                {record.studentName?.charAt(0) || 'S'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-zinc-100 truncate">
                                                    {record.studentName}
                                                </p>
                                                <p className="text-xs font-mono text-zinc-400 truncate">
                                                    {record.studentRollNo}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-300 border border-zinc-700">
                                                {record.batchInfo}
                                            </span>

                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                                                    record.status === 'present'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                        : 'bg-red-500/10 text-red-400 border-red-500/30'
                                                }`}
                                            >
                                                <span
                                                    className={`h-1.5 w-1.5 rounded-full ${record.status === 'present' ? 'bg-emerald-400' : 'bg-red-400'}`}
                                                />
                                                {record.status?.charAt(0).toUpperCase() +
                                                    record.status?.slice(1)}
                                            </span>

                                            <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                                                {new Date(record.markedAt).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-zinc-500">
                                <Calendar className="mx-auto mb-2 h-10 w-10 text-zinc-600" />
                                <p className="text-sm font-medium text-zinc-300">
                                    No attendance marked yet today
                                </p>
                                <p className="text-xs text-zinc-500 mt-1">
                                    Select one of your assigned batches above to take attendance.
                                </p>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
            <SessionHistory />
        </div>
    );
};

export default Dashboard;
