import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Landing from './pages/Landing';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Index from './pages/Index';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import OAuthCallback from './pages/OAuthCallback';

function AnimatedRoutes({ token }) {
  const location = useLocation();

  return (
    <div key={`${location.pathname}${location.search}`} className="page-transition">
      <Routes location={location}>
      {/* Redirect root to landing if not logged in, else to index */}
      <Route
        path="/"
        element={
          token ? <Navigate to="/index" replace /> : <Navigate to="/landing" replace />
        }
      />

      {/* Public routes */}
      <Route
        path="/landing"
        element={
          <PublicRoute>
            <Landing />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <Signup />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signin"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/oauth/callback"
        element={
          <PublicRoute>
            <OAuthCallback />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/index"
        element={
          <ProtectedRoute>
            <Index />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  const { loading, token } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">hourglass_empty</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AnimatedRoutes token={token} />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
