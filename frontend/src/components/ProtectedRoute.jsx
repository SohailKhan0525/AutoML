import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">hourglass_empty</span>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/landing" replace />;
  }

  return children;
};

export default ProtectedRoute;
