import { Navigate } from 'react-router-dom';
import React from 'react';

export default function ProtectedRoute({ children, roleRequired }: { children: React.ReactElement, roleRequired?: string }) {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const locationGranted = localStorage.getItem('location_granted');

    if (!token) return <Navigate to="/" />;
    if (!locationGranted) return <Navigate to="/location-prompt" />;
    if (roleRequired && role !== roleRequired) return <Navigate to="/" />;

    return children;
}
