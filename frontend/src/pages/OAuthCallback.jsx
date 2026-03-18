import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeOAuth } = useAuth();
  const [error, setError] = useState('');

  const token = useMemo(() => {
    const queryToken = searchParams.get('token') || '';
    if (queryToken) return queryToken;
    const hashValue = window.location.hash || '';
    if (!hashValue.startsWith('#')) return '';
    const parsed = new URLSearchParams(hashValue.slice(1));
    return parsed.get('token') || '';
  }, [searchParams]);
  const oauthError = useMemo(() => searchParams.get('error') || '', [searchParams]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      if (oauthError) {
        if (isMounted) setError(oauthError);
        return;
      }
      if (!token) {
        if (isMounted) setError('OAuth callback did not include a token.');
        return;
      }

      try {
        await completeOAuth(token);
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        navigate('/index', { replace: true });
      } catch (err) {
        if (isMounted) setError(err.message || 'OAuth sign-in failed.');
      }
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [token, oauthError, completeOAuth, navigate]);

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-xl">
        {!error ? (
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            <span className="font-medium">Finishing OAuth sign-in...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/80 dark:bg-red-900/10 text-red-700 dark:text-red-400 flex items-start gap-3">
              <span className="material-symbols-outlined text-base mt-0.5">error</span>
              <span>{error}</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Please try again from the sign-in page.
            </div>
            <Link
              to="/signin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
