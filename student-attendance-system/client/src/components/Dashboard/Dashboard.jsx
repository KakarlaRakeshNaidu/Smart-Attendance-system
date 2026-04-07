import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import studentService from '../../services/studentService';
import attendanceService from '../../services/attendanceService';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from 'recharts';
import {
    Users,
    ClipboardCheck,
    Calendar,
    TrendingUp,
    Clock,
    ArrowUpRight
} from 'lucide-react';
import Loader from '../common/Loader';
import Card from '../common/Card';

const Dashboard = () => {
    const { teacher } = useAuth();
    const [stats, setStats] = useState({
        totalStudents: 0,
        todayAttendance: 0,
        presentCount: 0,
        absentCount: 0
    });
    const [recentAttendance, setRecentAttendance] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [studentsRes, attendanceRes, allAttendanceRes] = await Promise.all([
                studentService.getAllStudents(),
                attendanceService.getTodayAttendance(),
                attendanceService.getAllAttendance().catch(() => ({ attendance: [] }))
            ]);

            const students = studentsRes.students || [];
            const attendance = attendanceRes.attendance || [];

            let presentCount = 0;
            let absentCount = 0;
            let records = [];

            if (attendance.length > 0) {
                records = attendance[0]?.records || [];
                records.forEach(record => {
                    if (record.status === 'present') presentCount++;
                    else absentCount++;
                });
            }

            setStats({
                totalStudents: students.length,
                todayAttendance: records.length,
                presentCount,
                absentCount
            });

            setRecentAttendance(records.slice(0, 5));

            const allAttendance = allAttendanceRes.attendance || [];
            const chartPoints = allAttendance
                .slice(0, 7)
                .reverse()
                .map((entry) => {
                    const entryRecords = entry.records || [];
                    const present = entryRecords.filter((item) => item.status === 'present').length;
                    return {
                        day: new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short' }),
                        present,
                        total: entryRecords.length
                    };
                });

            setChartData(chartPoints);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <Loader />;
    }

    const statCards = [
        {
            title: 'Total Students',
            value: stats.totalStudents,
            icon: Users,
            subtitle: 'Registered learners',
            link: '/students'
        },
        {
            title: "Today's Attendance",
            value: stats.todayAttendance,
            icon: ClipboardCheck,
            subtitle: 'Marked records today',
            link: '/attendance'
        },
        {
            title: 'Present Today',
            value: stats.presentCount,
            icon: TrendingUp,
            subtitle: 'Students present',
            link: '/attendance'
        },
        {
            title: 'Absent Today',
            value: stats.absentCount,
            icon: Clock,
            subtitle: 'Need follow-up',
            link: '/attendance'
        }
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <Card className="p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-white">Welcome back, {teacher?.name || 'Teacher'}</h1>
                        <p className="mt-1 text-sm text-zinc-400">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                    </div>
                    {teacher?.subject && <span className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-300">{teacher.subject}</span>}
                </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <Link key={index} to={stat.link}>
                            <Card className="group p-5 hover:bg-zinc-800">
                                <div className="mb-4 flex items-start justify-between">
                                    <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-2 text-zinc-200">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <ArrowUpRight className="h-4 w-4 text-zinc-500 transition group-hover:text-zinc-300" />
                                </div>
                                <p className="text-sm text-zinc-400">{stat.title}</p>
                                <p className="mt-1 text-3xl font-semibold text-white">{stat.value}</p>
                                <p className="mt-1 text-xs text-zinc-500">{stat.subtitle}</p>
                            </Card>
                        </Link>
                    );
                })}
            </div>

            <Card className="p-6">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Attendance Trend</h2>
                    <span className="text-xs text-zinc-400">Last 7 sessions</span>
                </div>

                {chartData.length > 0 ? (
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#fafafa" stopOpacity={0.45} />
                                        <stop offset="95%" stopColor="#fafafa" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis dataKey="day" stroke="#71717a" />
                                <YAxis stroke="#71717a" allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fafafa', borderRadius: '14px' }}
                                    labelStyle={{ color: '#fafafa' }}
                                />
                                <Area type="monotone" dataKey="present" stroke="#fafafa" strokeWidth={2} fill="url(#attendanceGradient)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 text-zinc-400">
                        <Calendar className="mb-2 h-10 w-10 text-zinc-600" />
                        <p className="font-medium">No attendance trend data yet</p>
                        <p className="text-sm text-zinc-500">Start marking attendance to populate this chart.</p>
                    </div>
                )}
            </Card>

            <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Recent Attendance</h2>
                    <Link to="/attendance" className="text-sm font-medium text-zinc-300 hover:text-white">View All</Link>
                </div>

                {recentAttendance.length > 0 ? (
                    <div className="space-y-3">
                        {recentAttendance.map((record, index) => (
                            <div key={index} className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-3 transition-all duration-200 hover:bg-zinc-800">
                                <div className="flex items-center space-x-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800">
                                        <span className="font-semibold text-zinc-100">{record.studentName?.charAt(0) || 'S'}</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-zinc-100">{record.studentName}</p>
                                        <p className="text-sm text-zinc-500">ID: {record.studentRollNo}</p>
                                    </div>
                                </div>
                                <span className={`rounded-xl px-3 py-1 text-xs font-medium ${record.status === 'present' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                    {record.status?.charAt(0).toUpperCase() + record.status?.slice(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center text-zinc-400">
                        <Calendar className="mx-auto mb-3 h-12 w-12 text-zinc-600" />
                        <p>No attendance records for today</p>
                        <Link to="/attendance" className="mt-2 inline-block font-medium text-zinc-300 hover:text-white">Take attendance now</Link>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default Dashboard;