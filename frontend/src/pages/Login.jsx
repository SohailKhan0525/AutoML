import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

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
