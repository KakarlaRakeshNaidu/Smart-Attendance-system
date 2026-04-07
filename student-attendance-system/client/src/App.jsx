import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import PrivateRoute from './components/common/PrivateRoute';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import ChangePassword from './components/Auth/ChangePassword';
import Dashboard from './components/Dashboard/Dashboard';
import StudentList from './components/Students/StudentList';
import AddStudent from './components/Students/AddStudent';
import Attendance from './pages/Attendance';
import TeacherProfile from './components/Profile/TeacherProfile';
import EditProfile from './components/Profile/EditProfile';
import { useAuth } from './context/AuthContext';

const App = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {!isAuthPage && isAuthenticated && <Sidebar />}
      <div className={!isAuthPage && isAuthenticated ? 'pl-72' : ''}>
        {!isAuthPage && isAuthenticated && <Navbar />}
        <main className={isAuthPage ? 'min-h-screen' : 'px-6 py-6'}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected Routes */}
          <Route path="/dashboard" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
          <Route path="/students" element={
            <PrivateRoute>
              <StudentList />
            </PrivateRoute>
          } />
          <Route path="/students/add" element={
            <PrivateRoute>
              <AddStudent />
            </PrivateRoute>
          } />
          <Route path="/attendance" element={
            <PrivateRoute>
              <Attendance />
            </PrivateRoute>
          } />
          <Route path="/profile" element={
            <PrivateRoute>
              <TeacherProfile />
            </PrivateRoute>
          } />
          <Route path="/profile/edit" element={
            <PrivateRoute>
              <EditProfile />
            </PrivateRoute>
          } />
          <Route path="/change-password" element={
            <PrivateRoute>
              <ChangePassword />
            </PrivateRoute>
          } />
          
          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 404 - Redirect to dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </main>
      </div>
    </div>
  );
};

export default App;