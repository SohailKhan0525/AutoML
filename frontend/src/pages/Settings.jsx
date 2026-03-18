import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

const SETTINGS_STORAGE_KEY = 'automl.settings';

const defaultSettings = {
  darkMode: localStorage.getItem('theme') === 'dark',
  emailNotifications: true,
  activityLog: true,
  twoFactor: false
};

export default function Settings() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(() => {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawSettings) return defaultSettings;

    try {
      return { ...defaultSettings, ...JSON.parse(rawSettings) };
    } catch {
      return defaultSettings;
    }
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const handleSettingChange = (key) => {
    try {
      setSettingsError('');
      const newSettings = { ...settings, [key]: !settings[key] };
      setSettings(newSettings);

      if (key === 'darkMode') {
        const newTheme = !settings.darkMode ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      }
    } catch {
      setSettingsError('Unable to save preference right now. Please try again.');
    }
  };

  const navigateBack = () => {
    try {
      setSettingsError('');
      navigate('/index');
    } catch {
      setSettingsError('Navigation failed. Please try again.');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwords.current) {
      setPasswordError('Current password is required');
      return;
    }

    if (passwords.new !== passwords.confirm) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwords.new.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    if (!/[A-Z]/.test(passwords.new) || !/[a-z]/.test(passwords.new) || !/\d/.test(passwords.new)) {
      setPasswordError('Password must include uppercase, lowercase, and a number');
      return;
    }

    if (!token) {
      setPasswordError('You are not authenticated. Please sign in again.');
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: passwords.current,
          new_password: passwords.new
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setPasswordError(data.detail || 'Unable to update password');
        return;
      }

      setPasswordSuccess(data.message || 'Password updated successfully');
      setPasswords({ current: '', new: '', confirm: '' });
      setShowPasswordChange(false);
    } catch {
      setPasswordError('Network error while updating password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <button
            onClick={navigateBack}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back
          </button>
        </div>

        {settingsError && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 text-sm flex items-center justify-between gap-3">
            <span>{settingsError}</span>
            <button type="button" onClick={() => setSettingsError('')} className="hover:opacity-80">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-6">
          {/* Account Section */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">account_circle</span>
              Account
            </h3>
            <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">Email Address</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{user?.email}</p>
                </div>
                <span className="material-symbols-outlined text-green-500">verified</span>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lock</span>
              Security
            </h3>
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              {!showPasswordChange ? (
                <button
                  onClick={() => setShowPasswordChange(true)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-3 text-slate-900 dark:text-slate-100 font-medium">
                    <span className="material-symbols-outlined">vpn_key</span>
                    Change Password
                  </span>
                  <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                </button>
              ) : (
                <form onSubmit={handlePasswordChange} className="space-y-3">
                  {passwordError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                      <span className="material-symbols-outlined text-base">error</span>
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-600 dark:text-green-400 text-sm">
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      {passwordSuccess}
                    </div>
                  )}
                  <input
                    type="password"
                    placeholder="Current Password"
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg focus:border-primary focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors font-medium disabled:opacity-60"
                    >
                      {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordChange(false);
                        setPasswords({ current: '', new: '', confirm: '' });
                        setPasswordError('');
                      }}
                      className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
                <span className="flex items-center gap-3 text-slate-900 dark:text-slate-100 font-medium">
                  <span className="material-symbols-outlined">shield</span>
                  Two-Factor Authentication
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.twoFactor}
                    onChange={() => handleSettingChange('twoFactor')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">tune</span>
              Preferences
            </h3>
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-slate-900 dark:text-slate-100 font-medium">
                  <span className="material-symbols-outlined">dark_mode</span>
                  Dark Mode
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.darkMode}
                    onChange={() => handleSettingChange('darkMode')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
                <span className="flex items-center gap-3 text-slate-900 dark:text-slate-100 font-medium">
                  <span className="material-symbols-outlined">mail</span>
                  Email Notifications
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.emailNotifications}
                    onChange={() => handleSettingChange('emailNotifications')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
                <span className="flex items-center gap-3 text-slate-900 dark:text-slate-100 font-medium">
                  <span className="material-symbols-outlined">history</span>
                  Activity Log
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.activityLog}
                    onChange={() => handleSettingChange('activityLog')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={navigateBack}
              className="w-full px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
