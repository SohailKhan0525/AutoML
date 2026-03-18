import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  
  const [shouldAutoRedirect, setShouldAutoRedirect] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(8);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pageError, setPageError] = useState('');
  const userMenuRef = useRef(null);

  // Check for auto=1 query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('auto') === '1') {
      setShouldAutoRedirect(true);
    }
  }, [location.search]);

  // Auto redirect after 8 seconds
  useEffect(() => {
    if (!shouldAutoRedirect) return;

    const timer = setTimeout(() => {
      navigate('/index');
    }, 8000);

    // Update countdown
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => prev - 1);
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [shouldAutoRedirect, navigate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const safeNavigate = (path) => {
    try {
      setPageError('');
      setUserMenuOpen(false);
      navigate(path);
    } catch {
      setPageError('Navigation failed. Please try again.');
    }
  };

  const handleLogout = () => {
    try {
      setPageError('');
      logout();
      setUserMenuOpen(false);
      navigate('/landing');
    } catch {
      setPageError('Unable to log out right now. Please refresh and try again.');
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Navbar */}
      <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-8">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-7xl mx-auto gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-primary rounded-lg text-white">
              <span className="material-symbols-outlined text-lg">analytics</span>
            </div>
            <h1 className="text-xl font-bold">AutoML</h1>
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined">account_circle</span>
              <span className="hidden sm:inline">Profile</span>
              <span className="material-symbols-outlined text-xs">expand_more</span>
            </button>

            {/* Dropdown Menu */}
            <div className={`${userMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg z-50`}>
              <button
                onClick={() => safeNavigate('/profile')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-200 dark:border-slate-700 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-base">person</span>
                <span className="text-sm">Profile</span>
              </button>
              <button
                onClick={() => safeNavigate('/settings')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-200 dark:border-slate-700 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-base">settings</span>
                <span className="text-sm">Settings</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 text-red-600 dark:text-red-400 transition-colors text-left"
                type="button"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {pageError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4">
          <div className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 text-sm flex items-center justify-between gap-3">
            <span>{pageError}</span>
            <button type="button" onClick={() => setPageError('')} className="hover:opacity-80">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Auto Redirect Notice */}
        {shouldAutoRedirect && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300 text-sm">
            Sign in successful. Redirecting you to the main dashboard in {redirectCountdown} seconds...
          </div>
        )}

        {/* Welcome Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined">person</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Welcome!</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{user?.email}</p>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            You're successfully authenticated and ready to use AutoML. Start by uploading your dataset to begin your machine learning journey.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4 mb-8">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <button 
            onClick={() => navigate('/index')}
            className="block w-full p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary dark:hover:border-primary transition-all group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined">upload_file</span>
              </div>
              <div>
                <h4 className="font-semibold">Upload Dataset</h4>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Start a new machine learning project</p>
              </div>
              <span className="material-symbols-outlined ml-auto text-slate-400 group-hover:text-primary transition-colors">arrow_forward</span>
            </div>
          </button>

          <button 
            onClick={() => navigate('/index')}
            className="block w-full p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-primary dark:hover:border-primary transition-all group text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined">poll</span>
              </div>
              <div>
                <h4 className="font-semibold">Go to App</h4>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Access the main AutoML interface</p>
              </div>
              <span className="material-symbols-outlined ml-auto text-slate-400 group-hover:text-primary transition-colors">arrow_forward</span>
            </div>
          </button>
        </div>

        {/* Account Info */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
          <h3 className="text-lg font-semibold mb-6">Account Information</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Email Address</p>
                <p className="font-semibold">{user?.email}</p>
              </div>
              <span className="material-symbols-outlined text-slate-400">verified</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Account Status</p>
                <p className="font-semibold">Active</p>
              </div>
              <span className="material-symbols-outlined text-green-500">check_circle</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
