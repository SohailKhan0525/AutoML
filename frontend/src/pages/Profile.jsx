import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pageError, setPageError] = useState('');

  const handleLogout = () => {
    try {
      setPageError('');
      logout();
      navigate('/landing');
    } catch {
      setPageError('Unable to log out right now. Please refresh and try again.');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h1>
          <button
            onClick={() => navigate('/index')}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back
          </button>
        </div>

        {pageError && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 text-sm flex items-center justify-between gap-3">
            <span>{pageError}</span>
            <button type="button" onClick={() => setPageError('')} className="hover:opacity-80">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-primary/90 px-5 sm:px-6 py-5 sm:py-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center text-white shadow-lg">
                <span className="material-symbols-outlined text-4xl">account_circle</span>
              </div>
              <div>
                <p className="text-white/80 text-xs uppercase tracking-widest">Account</p>
                <h2 className="text-white font-bold text-lg sm:text-xl break-all">{user?.email || 'Loading...'}</h2>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5 sm:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Account Created
                </label>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-2">
                  {formatDate(user?.created_at)}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Active</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    Current Plan
                  </label>
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-100 mt-1 flex items-center gap-2">
                    Free Plan
                    <span className="material-symbols-outlined text-lg text-blue-500">verified</span>
                  </p>
                </div>
                <span className="material-symbols-outlined text-4xl text-blue-400 opacity-30">card_giftcard</span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-3">
                Upgrade for advanced automation, model monitoring, and team workspaces.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold mb-2">Security Snapshot</h3>
              <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                <li>Use a unique password that is not reused across services.</li>
                <li>Enable two-factor authentication in Settings.</li>
                <li>Review activity logs regularly for unusual access.</li>
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/settings')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium"
              >
                <span className="material-symbols-outlined">settings</span>
                Settings
              </button>

              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium border border-red-200 dark:border-red-800"
              >
                <span className="material-symbols-outlined">logout</span>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
