import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-.9 2.4-2 3.1l3.2 2.5c1.9-1.7 3-4.2 3-7.2 0-.7-.1-1.4-.2-2.1H12z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.5-2.4l-3.2-2.5c-.9.6-2 1-3.3 1-2.6 0-4.8-1.8-5.6-4.2H3v2.6C4.6 19.8 8 22 12 22z" />
    <path fill="#FBBC05" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3A9.9 9.9 0 0 0 2 12c0 1.6.4 3.1 1 4.5l3.4-2.6z" />
    <path fill="#4285F4" d="M12 5.9c1.5 0 2.8.5 3.8 1.4l2.8-2.8C16.9 2.9 14.7 2 12 2 8 2 4.6 4.2 3 7.5l3.4 2.6C7.2 7.7 9.4 5.9 12 5.9z" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="fill-slate-700 dark:fill-slate-200">
    <path d="M12 .5C5.65.5.5 5.8.5 12.35c0 5.25 3.3 9.7 7.9 11.27.58.1.8-.26.8-.58 0-.28-.01-1.04-.02-2.04-3.2.72-3.88-1.58-3.88-1.58-.52-1.37-1.28-1.73-1.28-1.73-1.05-.73.08-.71.08-.71 1.16.08 1.78 1.23 1.78 1.23 1.03 1.82 2.7 1.3 3.36.99.1-.77.4-1.3.72-1.6-2.56-.3-5.25-1.33-5.25-5.94 0-1.31.46-2.37 1.22-3.2-.12-.3-.53-1.5.11-3.12 0 0 1-.33 3.3 1.22a11.1 11.1 0 0 1 6 0c2.3-1.55 3.3-1.22 3.3-1.22.64 1.62.23 2.82.11 3.12.76.83 1.22 1.89 1.22 3.2 0 4.62-2.7 5.63-5.28 5.93.42.37.79 1.1.79 2.23 0 1.61-.02 2.9-.02 3.29 0 .32.21.69.81.58 4.6-1.58 7.89-6.02 7.89-11.27C23.5 5.8 18.35.5 12 .5z" />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const { login, startOAuth, user } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (user && user.email) {
      navigate('/index');
    }
  }, [user, navigate]);

  const validateForm = () => {
    const errors = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!email.includes('@')) {
      errors.email = 'Please enter a valid email';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard?auto=1');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setError('');
    setOauthLoading(provider);
    try {
      await startOAuth(provider);
    } catch (err) {
      setError(err.message || `${provider} OAuth failed. Please try again.`);
      setOauthLoading('');
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-xl text-white mb-4 shadow-lg">
            <span className="material-symbols-outlined text-2xl">analytics</span>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-1">AutoML</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Sign in to your account</p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-8 mb-6">
          {/* Error Messages */}
          {error && (
            <div className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/80 dark:bg-red-900/10 text-red-700 dark:text-red-400 flex items-start gap-3">
              <span className="material-symbols-outlined text-base mt-0.5">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationErrors.email) setValidationErrors({ ...validationErrors, email: '' });
                  }}
                  className={`w-full pl-4 pr-11 py-3 rounded-lg border-2 transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none ${
                    validationErrors.email
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-slate-200 dark:border-slate-700 focus:border-primary dark:focus:border-primary'
                  }`}
                  placeholder="name@example.com"
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">mail</span>
              </div>
              {validationErrors.email && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  {validationErrors.email}
                </p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validationErrors.password) setValidationErrors({ ...validationErrors, password: '' });
                  }}
                  className={`w-full pl-4 pr-11 py-3 rounded-lg border-2 transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none ${
                    validationErrors.password
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-slate-200 dark:border-slate-700 focus:border-primary dark:focus:border-primary'
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {validationErrors.password && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  {validationErrors.password}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary/90 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined">{loading ? 'hourglass_empty' : 'login'}</span>
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-slate-900 text-slate-500">or</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-slate-600 dark:text-slate-400 text-sm">
            Don't have an account?
            <Link to="/signup" className="text-primary font-semibold hover:underline ml-1">Sign Up</Link>
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              disabled={Boolean(oauthLoading)}
              className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:border-primary dark:hover:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <GitHubIcon />
              <span>{oauthLoading === 'github' ? 'Connecting...' : 'Continue with GitHub'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={Boolean(oauthLoading)}
              className="w-full border-2 border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:border-primary dark:hover:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <GoogleIcon />
              <span>{oauthLoading === 'google' ? 'Connecting...' : 'Continue with Google'}</span>
            </button>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="space-y-2 text-center text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-green-500 text-sm">check_circle</span>
            <span>Secure login</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-green-500 text-sm">check_circle</span>
            <span>Your data is encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
