import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import Loader from './Loader';

/**
 * PrivateRoute - protects a route by authentication and optionally by role.
 *
 * Props:
 *   children   - the page component to render
 *   roles      - optional array of allowed roles, e.g. ['teacher', 'admin']
 *                If omitted, any authenticated user can access the route.
 */
const PrivateRoute = ({ children, roles }) => {
    const { isAuthenticated, loading, role } = useAuth();
    const location = useLocation();

    if (loading) return <Loader />;

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (roles && roles.length > 0 && !roles.includes(role)) {
        return <Navigate to="/access-denied" replace />;
    }

    return children;
};

export default PrivateRoute;
