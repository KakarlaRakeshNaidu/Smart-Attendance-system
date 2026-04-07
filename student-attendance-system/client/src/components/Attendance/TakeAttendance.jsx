import React, { useState, useEffect } from 'react';
import studentService from '../../services/studentService';
import attendanceService from '../../services/attendanceService';
import { Check, X, Users, Save } from 'lucide-react';
import Loader from '../common/Loader';
import toast from 'react-hot-toast';

const TakeAttendance = ({ onAttendanceMarked }) => {
    const [students, setStudents] = useState([]);
    const [attendance, setAttendance] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchStudentsAndTodayAttendance();
    }, []);

    const fetchStudentsAndTodayAttendance = async () => {
        try {
            // Fetch students and today's attendance in parallel
            const [studentsResponse, todayAttendanceResponse] = await Promise.all([
                studentService.getAllStudents(),
                attendanceService.getTodayAttendance().catch(() => ({ attendance: [] }))
            ]);

            const studentList = studentsResponse.students || [];
            setStudents(studentList);

            // Create a map of today's attendance records by student ID
            // Response structure: attendance[0].records where each record has studentId (populated or id string)
            const attendanceData = todayAttendanceResponse.attendance || [];
            const todayRecords = attendanceData.length > 0 ? attendanceData[0]?.records || [] : [];
            const attendanceMap = {};
            todayRecords.forEach(record => {
                // studentId can be populated object with _id, or just the id string
                const studentId = record.studentId?._id || record.studentId;
                if (studentId) {
                    attendanceMap[studentId] = record.status;
                }
            });

            // Initialize attendance: use today's attendance if exists, otherwise default to absent
            const initialAttendance = {};
            studentList.forEach(student => {
                initialAttendance[student._id] = attendanceMap[student._id] || 'absent';
            });
            setAttendance(initialAttendance);
        } catch (error) {
            toast.error('Failed to fetch students');
        } finally {
            setLoading(false);
        }
    };

    const toggleAttendance = (studentId) => {
        setAttendance(prev => ({
            ...prev,
            [studentId]: prev[studentId] === 'present' ? 'absent' : 'present'
        }));
    };

    const markAllPresent = () => {
        const allPresent = {};
        students.forEach(student => {
            allPresent[student._id] = 'present';
        });
        setAttendance(allPresent);
    };

    const markAllAbsent = () => {
        const allAbsent = {};
        students.forEach(student => {
            allAbsent[student._id] = 'absent';
        });
        setAttendance(allAbsent);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const records = Object.entries(attendance).map(([studentId, status]) => ({
                studentId,
                status
            }));

            await attendanceService.takeAttendance({ records });
            toast.success('Attendance marked successfully!');
            if (onAttendanceMarked) onAttendanceMarked();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to mark attendance');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <Loader />;
    }

    if (students.length === 0) {
        return (
            <div className="py-12 text-center">
                <Users className="mx-auto mb-4 h-16 w-16 text-zinc-600" />
                <p className="text-lg text-zinc-300">No students registered yet</p>
                <p className="mt-2 text-sm text-zinc-500">Add students first to take attendance</p>
            </div>
        );
    }

    const presentCount = Object.values(attendance).filter(s => s === 'present').length;
    const absentCount = Object.values(attendance).filter(s => s === 'absent').length;

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <p className="text-sm text-zinc-400">
                        <span className="font-semibold text-emerald-300">{presentCount} Present</span>
                        {' | '}
                        <span className="font-semibold text-red-300">{absentCount} Absent</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={markAllPresent} className="rounded-xl bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-all duration-200 hover:bg-emerald-500/30">
                        Mark All Present
                    </button>
                    <button type="button" onClick={markAllAbsent} className="rounded-xl bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-300 transition-all duration-200 hover:bg-red-500/30">
                        Mark All Absent
                    </button>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {students.map((student) => (
                        <div key={student._id} onClick={() => toggleAttendance(student._id)} className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all duration-200 ${attendance[student._id] === 'present' ? 'border-emerald-900 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-red-900 bg-red-500/10 hover:bg-red-500/20'}`}>
                            <div className="flex items-center space-x-3">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${attendance[student._id] === 'present' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                                    <span className={`font-semibold ${attendance[student._id] === 'present' ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {student.name?.charAt(0) || 'S'}
                                    </span>
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-100">{student.name}</p>
                                    <p className="text-sm text-zinc-500">ID: {student.studentId}</p>
                                </div>
                            </div>
                            <div className={`rounded-xl p-2 ${attendance[student._id] === 'present' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                {attendance[student._id] === 'present' ? (
                                    <Check className="h-5 w-5 text-white" />
                                ) : (
                                    <X className="h-5 w-5 text-white" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <button type="submit" disabled={submitting} className="w-full btn-success mt-6 py-3 flex items-center justify-center gap-2">
                    {submitting ? (
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save className="h-5 w-5" />
                            Save Attendance
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default TakeAttendance;