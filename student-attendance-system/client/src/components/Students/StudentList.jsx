import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import studentService from '../../services/studentService';
import StudentCard from './StudentCard';
import { UserPlus, Search, Download, Users, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { SkeletonTableRows } from '../common/Skeleton';
import toast from 'react-hot-toast';
import Card from '../common/Card';

const StudentList = () => {
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClass, setSelectedClass] = useState('all');
    const [expandedStudentId, setExpandedStudentId] = useState(null);

    useEffect(() => {
        fetchStudents();
    }, []);

    useEffect(() => {
        const filtered = students.filter((student) => {
            const matchesSearch =
                student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                student.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (student.email || '').toLowerCase().includes(searchTerm.toLowerCase());

            const matchesClass = selectedClass === 'all' || (student.class || 'N/A') === selectedClass;

            return matchesSearch && matchesClass;
        });
        setFilteredStudents(filtered);
    }, [searchTerm, students, selectedClass]);

    const fetchStudents = async () => {
        try {
            const response = await studentService.getAllStudents();
            setStudents(response.students || []);
            setFilteredStudents(response.students || []);
        } catch (error) {
            toast.error('Failed to fetch students');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this student?')) {
            try {
                await studentService.deleteStudent(id);
                toast.success('Student deleted successfully');
                fetchStudents();
            } catch (error) {
                toast.error('Failed to delete student');
            }
        }
    };

    const handleDownloadCSV = async () => {
        try {
            const blob = await studentService.downloadStudentsCSV();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'students_list.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('CSV downloaded successfully');
        } catch (error) {
            toast.error('Failed to download CSV');
        }
    };


    const classOptions = ['all', ...new Set(students.map((student) => student.class || 'N/A'))];

    const getProfileUrl = (student) =>
        student.profilePhoto
            ? `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}${student.profilePhoto}`
            : null;

    return (
        <div className="space-y-6 page-enter">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-title">Students</h1>
                    <p className="text-subtext">{students?.length || 0} registered students</p>
                </div>
                <div className="flex gap-2 sm:gap-3">
                    <button onClick={handleDownloadCSV} className="btn-secondary flex items-center gap-2 text-sm">
                        <Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Export</span> CSV
                    </button>
                    <Link to="/students/add" className="btn-primary flex items-center gap-2 text-sm">
                        <UserPlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Add</span> Student
                    </Link>
                </div>
            </div>

            <Card className="p-4 sm:p-6">
                {/* Filters */}
                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">

                    <div className="relative sm:col-span-2">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or student ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input-field pl-10"
                        />
                    </div>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="input-field"
                    >
                        {classOptions.map((option) => (
                            <option key={option} value={option} className="bg-zinc-900">
                                {option === 'all' ? 'All Classes' : option}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Skeleton table while loading */}
                {loading ? (
                    <SkeletonTableRows rows={6} />
                ) : filteredStudents?.length > 0 ? (

                    <>
                        {/* ===== DESKTOP TABLE (hidden on mobile) ===== */}
                        <div className="hidden md:block overflow-x-auto rounded-2xl border border-zinc-800">
                            <table className="w-full min-w-[600px]">
                                <thead>
                                    <tr className="border-b border-zinc-800 bg-zinc-900/70">
                                        {['Avatar', 'Name', 'Email', 'Class', 'Actions'].map(col => (
                                            <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStudents.map((student, index) => {
                                        const expanded = expandedStudentId === student._id;
                                        const profileUrl = getProfileUrl(student);
                                        return (
                                            <React.Fragment key={student._id}>
                                                <tr className={`${index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950/40'} border-b border-zinc-800 transition-all duration-200 hover:bg-zinc-800/70`}>
                                                    <td className="px-4 py-3">
                                                        <div className="h-10 w-10 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800">
                                                            {profileUrl ? (
                                                                <img src={profileUrl} alt={student.name} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-zinc-300">
                                                                    {student.name?.charAt(0) || 'S'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium text-zinc-100">{student.name}</td>
                                                    <td className="px-4 py-3 text-sm text-zinc-300">{student.email || '—'}</td>
                                                    <td className="px-4 py-3 text-sm text-zinc-300">{student.class || 'N/A'}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setExpandedStudentId(expanded ? null : student._id)}
                                                                className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs"
                                                            >
                                                                Manage {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(student._id)}
                                                                className="rounded-xl border border-red-900/60 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-all duration-200 hover:bg-red-500/20"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {expanded && (
                                                    <tr className="border-b border-zinc-800 bg-zinc-950">
                                                        <td colSpan={5} className="p-4">
                                                            <StudentCard student={student} onDelete={handleDelete} onFaceRegistered={fetchStudents} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ===== MOBILE CARD LIST (hidden on desktop) ===== */}
                        <div className="md:hidden space-y-3">
                            {filteredStudents.map((student) => {
                                const expanded = expandedStudentId === student._id;
                                const profileUrl = getProfileUrl(student);
                                return (
                                    <div key={student._id} className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                                        {/* Card header row */}
                                        <div className="flex items-center gap-3 p-4">
                                            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800">
                                                {profileUrl ? (
                                                    <img src={profileUrl} alt={student.name} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-300">
                                                        {student.name?.charAt(0) || 'S'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-zinc-100 truncate">{student.name}</p>
                                                <p className="text-xs text-zinc-400 truncate">{student.studentId}</p>
                                                {student.class && (
                                                    <span className="mt-1 inline-block rounded-lg bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                                                        {student.class}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                <button
                                                    onClick={() => setExpandedStudentId(expanded ? null : student._id)}
                                                    className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs"
                                                >
                                                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                    {expanded ? 'Close' : 'Manage'}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(student._id)}
                                                    className="flex items-center justify-center gap-1 rounded-xl border border-red-900/60 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-all"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Delete
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded panel */}
                                        {expanded && (
                                            <div className="border-t border-zinc-800 p-4 bg-zinc-950">
                                                <StudentCard student={student} onDelete={handleDelete} onFaceRegistered={fetchStudents} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="py-14 text-center">
                        <Users className="mx-auto mb-4 h-14 w-14 text-zinc-600" />
                        <p className="text-lg text-zinc-300">No students found</p>
                        <Link to="/students/add" className="mt-2 inline-block font-medium text-zinc-100 hover:text-white">
                            Add your first student
                        </Link>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default StudentList;