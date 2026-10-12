import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import PrivateRoute from './components/common/PrivateRoute';
import AccessDenied from './components/common/AccessDenied';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import Loader from './components/common/Loader';
import ErrorBoundary from './components/common/ErrorBoundary';
import Activate from './components/Auth/Activate';
import ChangePassword from './components/Auth/ChangePassword';
import Dashboard from './components/Dashboard/Dashboard';
import StudentList from './components/Students/StudentList';
import AddStudent from './components/Students/AddStudent';
import { AcademicHome, OfferingDetail, SessionAttendance, LegacyAttendance } from './components/Academic/AcademicPages';
import TeacherProfile from './components/Profile/TeacherProfile';
import EditProfile from './components/Profile/EditProfile';
import StudentDashboard from './components/Student/StudentDashboard';
import AdminDashboard from './components/Admin/AdminDashboard';
import { useAuth } from './context/authContextState';

// Role-based root redirect
const RootRedirect = () => {
    const { isAuthenticated, role, loading } = useAuth();
    if (loading) return <Loader />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (role === 'teacher') return <Navigate to="/dashboard" replace />;
    if (role === 'admin')   return <Navigate to="/admin" replace />;
    if (role === 'student') return <Navigate to="/my-attendance" replace />;
    return <Navigate to="/login" replace />;
};

const App = () => {
    const location = useLocation();
    const { isAuthenticated, role, loading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const isAuthPage = ['/login', '/register', '/activate'].includes(location.pathname);
    // Student and admin use full-width standalone pages
    const isStandalonePage = role === 'student' || role === 'admin' || !isAuthenticated;
    const showShell = isAuthenticated && !isAuthPage && !isStandalonePage;

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            {showShell && (
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            )}
            <div className={showShell ? 'lg:pl-72' : ''}>
                {showShell && (
                    <Navbar onMenuToggle={() => setSidebarOpen(o => !o)} />
                )}
                <main className={isAuthPage ? 'min-h-screen' : showShell ? 'px-6 py-6' : ''}>
                    <ErrorBoundary key={location.pathname}>
                    <Routes>
                        {/* Public */}
                        <Route path="/login"    element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/activate" element={<Activate />} />

                        {/* Access denied */}
                        <Route path="/access-denied" element={<AccessDenied />} />

                        {/* Teacher routes */}
                        <Route path="/dashboard" element={
                            <PrivateRoute roles={['teacher']}>
                                <Dashboard />
                            </PrivateRoute>
                        } />
                        <Route path="/students" element={
                            <PrivateRoute roles={['teacher', 'admin']}>
                                <StudentList />
                            </PrivateRoute>
                        } />
                        <Route path="/students/add" element={
                            <PrivateRoute roles={['teacher', 'admin']}>
                                <AddStudent />
                            </PrivateRoute>
                        } />
                        <Route path="/attendance" element={
                            <PrivateRoute roles={['teacher']}>
                                <Navigate to="/academic" replace />
                            </PrivateRoute>
                        } />
                        <Route path="/profile" element={
                            <PrivateRoute roles={['teacher']}>
                                <TeacherProfile />
                            </PrivateRoute>
                        } />
                        <Route path="/profile/edit" element={
                            <PrivateRoute roles={['teacher']}>
                                <EditProfile />
                            </PrivateRoute>
                        } />
                        <Route path="/change-password" element={
                            <PrivateRoute>
                                <ChangePassword />
                            </PrivateRoute>
                        } />

                        {/* Student routes */}
                        <Route path="/my-attendance" element={
                            <PrivateRoute roles={['student']}>
                                <StudentDashboard />
                            </PrivateRoute>
                        } />

                        {/* Admin routes */}
                        <Route path="/admin" element={
                            <PrivateRoute roles={['admin']}>
                                <AdminDashboard />
                            </PrivateRoute>
                        } />

                        <Route path="/academic" element={<PrivateRoute><AcademicHome /></PrivateRoute>} />
                        <Route path="/academic/offerings/:id" element={<PrivateRoute><OfferingDetail /></PrivateRoute>} />
                        <Route path="/academic/sessions/:id" element={<PrivateRoute><SessionAttendance /></PrivateRoute>} />
                        <Route path="/legacy-attendance" element={<PrivateRoute><LegacyAttendance /></PrivateRoute>} />
                        {/* Root redirect */}
                        <Route path="/" element={<RootRedirect />} />

                        {/* 404 */}
                        <Route path="*" element={<RootRedirect />} />
                    </Routes>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
};

export default App;
