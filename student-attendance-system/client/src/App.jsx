import React, { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import PrivateRoute from './components/common/PrivateRoute';
import PageSkeleton from './components/common/PageSkeleton';
import ErrorBoundary from './components/common/ErrorBoundary';
import { useAuth } from './context/authContextState';
import { NotificationProvider } from './components/Notifications/notificationState';
import { ThemeControl } from './components/common/ThemeControl';
const LandingPage = lazy(() => import('./components/Landing/LandingPage'));
const Login = lazy(() => import('./components/Auth/Login'));
const Activate = lazy(() => import('./components/Auth/Activate'));
const ChangePassword = lazy(() => import('./components/Auth/ChangePassword'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const StudentList = lazy(() => import('./components/Students/StudentList'));
const AddStudent = lazy(() => import('./components/Students/AddStudent'));
const Attendance = lazy(() => import('./pages/Attendance'));
const LectureAttendance = lazy(() => import('./pages/LectureAttendance'));
const TeacherProfile = lazy(() => import('./components/Profile/TeacherProfile'));
const EditProfile = lazy(() => import('./components/Profile/EditProfile'));
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard'));
const TeacherManagement = lazy(() => import('./components/Admin/TeacherManagement'));
const StudentManagement = lazy(() => import('./components/Admin/StudentManagement'));
const AdminAddStudent = lazy(() => import('./components/Admin/AddStudent'));
const AdminAttendance = lazy(() => import('./components/Admin/AdminAttendance'));
const AuditLogs = lazy(() => import('./components/Admin/AuditLogs'));
const ClassManagement = lazy(() => import('./components/Admin/ClassManagement'));
const SubjectManagement = lazy(() => import('./components/Admin/SubjectManagement'));
const EnrollmentManagement = lazy(() => import('./components/Admin/EnrollmentManagement'));
const AssignmentManagement = lazy(() => import('./components/Admin/AssignmentManagement'));
const StudentDashboard = lazy(() => import('./components/Student/StudentDashboard'));
const StudentAttendanceView = lazy(() => import('./components/Student/StudentAttendanceView'));
const StudentReports = lazy(() => import('./components/Student/StudentReports'));
const StudentProfile = lazy(() => import('./components/Student/StudentProfile'));
const AttendanceAnalytics = lazy(() => import('./components/Analytics/AttendanceAnalytics'));
const Notifications = lazy(() => import('./components/Notifications/Notifications'));
const SemesterReports = lazy(() => import('./components/Reports/SemesterReports'));
const AccessDenied = lazy(() => import('./components/common/AccessDenied'));
const academic = (name) =>
    lazy(() => import('./components/Academic/AcademicPages').then((m) => ({ default: m[name] })));
const student = (name) =>
    lazy(() => import('./components/Student/StudentPortalPages').then((m) => ({ default: m[name] })));
const correction = (name) =>
    lazy(() => import('./components/Corrections/Corrections').then((m) => ({ default: m[name] })));
const admin = (name) =>
    lazy(() => import('./components/Admin/AdminPortalPages').then((m) => ({ default: m[name] })));
const AcademicHome = academic('AcademicHome'),
    OfferingDetail = academic('OfferingDetail'),
    SessionAttendance = academic('SessionAttendance'),
    LegacyAttendance = academic('LegacyAttendance');
const MyCourses = student('MyCourses'),
    MyCourse = student('MyCourse'),
    MySession = student('MySession'),
    MyAttendance = student('MyAttendance'),
    MyProfile = student('MyProfile');
const CorrectionQueue = correction('CorrectionQueue'),
    CorrectionSession = correction('CorrectionSession'),
    CorrectionDetail = correction('CorrectionDetail');
const Accounts = lazy(() => import('./components/Admin/Accounts'));
const AttendanceBrowser = admin('AdminAttendance');
const AdminDirectory = admin('AdminDirectory'),
    AdminAccountDetail = admin('AdminAccountDetail'),
    AdminProfileDetail = admin('AdminProfileDetail');
const guard = (element, roles) => <PrivateRoute roles={roles}>{element}</PrivateRoute>;
const App = () => {
    const location = useLocation();
    const { isAuthenticated, role } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const publicPage = ['/', '/login', '/register', '/activate'].includes(location.pathname);
    const shell = isAuthenticated && !publicPage;
    const home =
        role === 'admin' ? '/admin/dashboard' : role === 'student' ? '/student/dashboard' : '/dashboard';
    return (
        <NotificationProvider>
            <div className="min-h-screen bg-zinc-950 text-zinc-100">
                {shell && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
                <div className={shell ? 'workspace-shell' : ''}>
                    {shell && <Navbar onMenuToggle={() => setSidebarOpen((v) => !v)} />}
                    {!shell && (
                        <div className="fixed right-4 bottom-4 z-50">
                            <ThemeControl />
                        </div>
                    )}
                    <main className={publicPage ? 'min-h-screen' : 'app-main'}>
                        <ErrorBoundary key={location.pathname}>
                            <Suspense fallback={<PageSkeleton />}>
                                <Routes>
                                    <Route path="/" element={<LandingPage />} />
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/register" element={<Navigate to="/login" replace />} />
                                    <Route path="/activate" element={<Activate />} />
                                    <Route path="/access-denied" element={<AccessDenied />} />
                                    <Route path="/change-password" element={guard(<ChangePassword />)} />
                                    <Route path="/dashboard" element={guard(<Dashboard />, ['teacher'])} />
                                    <Route
                                        path="/students"
                                        element={guard(<StudentList />, ['teacher', 'admin'])}
                                    />
                                    <Route
                                        path="/students/add"
                                        element={guard(<AddStudent />, ['teacher', 'admin'])}
                                    />
                                    <Route path="/attendance" element={guard(<Attendance />, ['teacher'])} />
                                    <Route
                                        path="/lecture-attendance"
                                        element={guard(<LectureAttendance />, ['teacher'])}
                                    />
                                    <Route
                                        path="/profile"
                                        element={guard(<TeacherProfile />, ['teacher', 'admin'])}
                                    />
                                    <Route
                                        path="/profile/edit"
                                        element={guard(<EditProfile />, ['teacher', 'admin'])}
                                    />
                                    <Route
                                        path="/admin"
                                        element={<Navigate to="/admin/dashboard" replace />}
                                    />
                                    <Route
                                        path="/admin/dashboard"
                                        element={guard(<AdminDashboard />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/teachers"
                                        element={guard(<TeacherManagement />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/students"
                                        element={guard(<StudentManagement />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/students/add"
                                        element={guard(<AdminAddStudent />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/classes"
                                        element={guard(<ClassManagement />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/subjects"
                                        element={guard(<SubjectManagement />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/enrollments"
                                        element={guard(<EnrollmentManagement />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/assignments"
                                        element={guard(<AssignmentManagement />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/attendance"
                                        element={guard(<AdminAttendance />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/attendance-browser"
                                        element={guard(<AttendanceBrowser />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/audit-logs"
                                        element={guard(<AuditLogs />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/profile"
                                        element={guard(<TeacherProfile />, ['admin'])}
                                    />
                                    <Route path="/admin/accounts" element={guard(<Accounts />, ['admin'])} />
                                    <Route
                                        path="/admin/accounts/:id"
                                        element={guard(<AdminAccountDetail />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/directories/:kind"
                                        element={guard(<AdminDirectory />, ['admin'])}
                                    />
                                    <Route
                                        path="/admin/:kind/:id"
                                        element={guard(<AdminProfileDetail />, ['admin'])}
                                    />
                                    <Route
                                        path="/student/dashboard"
                                        element={guard(<StudentDashboard />, ['student'])}
                                    />
                                    <Route
                                        path="/student/attendance"
                                        element={guard(<StudentAttendanceView />, ['student'])}
                                    />
                                    <Route
                                        path="/student/reports"
                                        element={guard(<StudentReports />, ['student'])}
                                    />
                                    <Route
                                        path="/student/profile"
                                        element={guard(<StudentProfile />, ['student'])}
                                    />
                                    <Route
                                        path="/my-attendance"
                                        element={<Navigate to="/student/dashboard" replace />}
                                    />
                                    <Route
                                        path="/my-attendance/history"
                                        element={guard(<MyAttendance />, ['student'])}
                                    />
                                    <Route path="/my-profile" element={guard(<MyProfile />, ['student'])} />
                                    <Route
                                        path="/academic"
                                        element={guard(role === 'student' ? <MyCourses /> : <AcademicHome />)}
                                    />
                                    <Route
                                        path="/academic/offerings/:id"
                                        element={guard(
                                            role === 'student' ? <MyCourse /> : <OfferingDetail />
                                        )}
                                    />
                                    <Route
                                        path="/academic/sessions/:id"
                                        element={guard(
                                            role === 'student' ? <MySession /> : <SessionAttendance />
                                        )}
                                    />
                                    <Route path="/legacy-attendance" element={guard(<LegacyAttendance />)} />
                                    <Route
                                        path="/attendance-analytics"
                                        element={guard(<AttendanceAnalytics />)}
                                    />
                                    <Route
                                        path="/notifications"
                                        element={guard(<Notifications />, ['student', 'teacher'])}
                                    />
                                    <Route path="/semester-reports" element={guard(<SemesterReports />)} />
                                    <Route
                                        path="/attendance-corrections"
                                        element={guard(<CorrectionQueue />)}
                                    />
                                    <Route
                                        path="/attendance-corrections/sessions/:sessionId"
                                        element={guard(<CorrectionSession />, ['student'])}
                                    />
                                    <Route
                                        path="/attendance-corrections/sessions/:sessionId/requests/:requestId"
                                        element={guard(<CorrectionDetail />)}
                                    />
                                    <Route
                                        path="*"
                                        element={<Navigate to={isAuthenticated ? home : '/login'} replace />}
                                    />
                                </Routes>
                            </Suspense>
                        </ErrorBoundary>
                    </main>
                </div>
            </div>
        </NotificationProvider>
    );
};
export default App;
