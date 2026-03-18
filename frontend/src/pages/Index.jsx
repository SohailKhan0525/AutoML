import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pageError, setPageError] = useState('');
  const userMenuRef = useRef(null);

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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    setPageError('');
  };

  const showNotReadyMessage = (featureName) => {
    setPageError(`${featureName} is not available until a dataset is uploaded and processed.`);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen md:h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg text-white">
            <span className="material-symbols-outlined block">analytics</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">AutoML</h1>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => handleTabChange('overview')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'overview'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span>Overview</span>
          </button>

          <button
            onClick={() => handleTabChange('data')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'data'
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="material-symbols-outlined">table_chart</span>
            <span>Datasets</span>
          </button>

          <button
            onClick={() => handleTabChange('models')}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'models'
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="material-symbols-outlined">model_training</span>
            <span>Models</span>
          </button>

        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors"
          >
            <span className="material-symbols-outlined text-base">person</span>
            <span className="text-sm">Profile</span>
          </button>

          <div className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-sm">person</span>
            </div>
            <div className="text-xs flex-1 min-w-0">
              <p className="font-bold truncate">{user?.email || 'User'}</p>
              <p className="text-slate-500 text-xs">Free Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-primary p-2 rounded-lg text-white">
                  <span className="material-symbols-outlined block">analytics</span>
                </div>
                <h2 className="font-bold">AutoML</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <nav className="space-y-2">
              <button
                onClick={() => handleTabChange('overview')}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">dashboard</span>
                Overview
              </button>
              <button
                onClick={() => handleTabChange('data')}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'data' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">table_chart</span>
                Datasets
              </button>
              <button
                onClick={() => handleTabChange('models')}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'models' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">model_training</span>
                Models
              </button>
              <button
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate('/profile');
                }}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined">person</span>
                Profile
              </button>
              <button
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate('/settings');
                }}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined">settings</span>
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <span className="material-symbols-outlined">logout</span>
                Logout
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h2 className="text-base sm:text-lg font-bold">No dataset uploaded</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">PENDING</span>
          </div>

          <div className="w-full md:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 flex-nowrap md:flex-wrap overflow-x-auto pb-1 md:pb-0">
              <button
                className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                type="button"
                onClick={() => showNotReadyMessage('Export report')}
              >
                <span className="material-symbols-outlined text-base">cloud_download</span>
                <span className="hidden sm:inline">Export Report</span>
              </button>

            <div className="relative shrink-0">
              <input
                type="file"
                accept=".csv"
                className="block w-36 sm:w-44 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary hover:file:bg-primary/20"
              />
            </div>

            <select className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs bg-white dark:bg-slate-900">
              <option value="">Target (auto: last column)</option>
            </select>

            <button
              className="shrink-0 border border-primary text-primary px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/10"
              type="button"
              onClick={() => showNotReadyMessage('CSV upload action')}
            >
              Upload CSV
            </button>

            <button
              className="shrink-0 bg-primary text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:opacity-90"
              type="button"
              onClick={() => showNotReadyMessage('AutoML run')}
            >
              Run AutoML
            </button>

            <button
              className="shrink-0 border border-slate-300 dark:border-slate-700 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              type="button"
              onClick={() => showNotReadyMessage('Model download')}
            >
              Download Model
            </button>

            {/* User Menu Dropdown */}
            <div className="relative shrink-0" ref={userMenuRef}>
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
              <div className={`${userMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg z-50`}>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/profile');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-200 dark:border-slate-700 transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-base">person</span>
                  <span className="text-sm">Profile</span>
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate('/settings');
                  }}
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
          </div>
        </header>

        {pageError && (
          <div className="px-4 sm:px-6 pt-3">
            <div className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 text-sm flex items-center justify-between gap-3">
              <span>{pageError}</span>
              <button type="button" onClick={() => setPageError('')} className="hover:opacity-80">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Status Messages */}
        <div className="px-4 sm:px-6 pt-3">
          <p className="text-xs text-slate-500">Upload a CSV file to begin.</p>
          <p className="text-xs text-slate-500 mt-1">Pipeline notes will appear here.</p>
          <p className="text-xs text-slate-500 mt-1">Step 0: Waiting for file upload.</p>
          <div className="hidden mt-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs"></div>
        </div>

        {/* Drop Zone */}
        <div className="px-4 sm:px-6 pt-3">
          <div className="border border-dashed border-primary/40 rounded-xl p-4 bg-white/50 dark:bg-slate-900/40 text-center text-sm text-slate-600 dark:text-slate-300">
            Drag & drop a CSV here, or use the file picker above.
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto flex-1 w-full">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-slate-500">
                No dataset loaded yet. Upload a CSV and run AutoML to populate dashboard insights.
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Rows</span>
                    <span className="material-symbols-outlined text-primary">view_headline</span>
                  </div>
                  <p className="text-3xl font-bold">-</p>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-green-500">trending_up</span>
                    +12% from last upload
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Columns</span>
                    <span className="material-symbols-outlined text-primary">view_column</span>
                  </div>
                  <p className="text-3xl font-bold">-</p>
                  <p className="text-xs text-slate-400 mt-2">-</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">Missing Values</span>
                    <span className="material-symbols-outlined text-orange-500">error</span>
                  </div>
                  <p className="text-3xl font-bold text-orange-500">-</p>
                  <p className="text-xs text-slate-400 mt-2 italic">Target: -</p>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Correlation Heatmap */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">grid_view</span>
                      Correlation Matrix
                    </h3>
                  </div>
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center">
                    <div className="text-center text-xs text-slate-500">Upload a dataset to render correlation.</div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="bg-white/80 dark:bg-slate-900/80 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold tracking-widest uppercase">Correlation Heatmap</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">Top correlated pairs will appear here.</p>
                </div>

                {/* Feature Importance */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">bar_chart</span>
                      Feature Importance
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Feature importance will appear after running AutoML.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Dataset History</h4>
                  <button className="text-xs text-primary hover:underline" type="button" onClick={() => showNotReadyMessage('Dataset refresh')}>
                    Refresh
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  <p className="text-slate-500">No datasets in history.</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">preview</span>
                    Dataset Preview
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                      <input className="pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm focus:ring-primary focus:border-primary" placeholder="Filter rows..." type="text"/>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm"><tbody></tbody></table>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-slate-500">
                  <p>Showing 0 entries</p>
                  <div className="flex items-center gap-2">
                    <button className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30" type="button" onClick={() => showNotReadyMessage('Pagination')}><span className="material-symbols-outlined text-sm">chevron_left</span></button>
                    <span className="font-bold text-primary">1</span>
                    <button className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700" type="button" onClick={() => showNotReadyMessage('Pagination')}><span className="material-symbols-outlined text-sm">chevron_right</span></button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Models Tab */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">leaderboard</span>
                    AutoML Model Leaderboard
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="px-6 py-3">Rank</th>
                        <th className="px-6 py-3">Model Type</th>
                        <th className="px-6 py-3">Metric</th>
                        <th className="px-6 py-3">Score</th>
                        <th className="px-6 py-3">Extra</th>
                        <th className="px-6 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="px-6 py-4" colSpan="6">No model results yet. Upload a dataset and run AutoML.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">psychology</span>
                    Prediction Playground
                  </h3>
                  <p className="text-xs text-slate-500 mt-2">Run a prediction using the trained model and current target column.</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <p className="text-sm text-slate-500 md:col-span-2">Run AutoML to generate prediction inputs.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90" type="button" onClick={() => showNotReadyMessage('Prediction')}>
                      Predict
                    </button>
                    <span className="text-xs text-slate-500">Awaiting model training.</span>
                  </div>
                  <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-auto">Predictions will appear here.</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Footer Nav */}
        <footer className="md:hidden sticky bottom-0 z-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-around items-center py-2">
            <button
              onClick={() => handleTabChange('overview')}
              className={`flex flex-col items-center gap-1 ${activeTab === 'overview' ? 'text-primary' : 'text-slate-500'}`}
            >
              <span className="material-symbols-outlined">dashboard</span>
              <span className="text-[10px] font-bold">Overview</span>
            </button>
            <button
              onClick={() => handleTabChange('data')}
              className={`flex flex-col items-center gap-1 ${activeTab === 'data' ? 'text-primary' : 'text-slate-500'}`}
            >
              <span className="material-symbols-outlined">table_chart</span>
              <span className="text-[10px] font-bold">Data</span>
            </button>
            <button
              onClick={() => handleTabChange('models')}
              className={`flex flex-col items-center gap-1 ${activeTab === 'models' ? 'text-primary' : 'text-slate-500'}`}
            >
              <span className="material-symbols-outlined">model_training</span>
              <span className="text-[10px] font-bold">Models</span>
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="flex flex-col items-center gap-1 text-slate-500"
            >
              <span className="material-symbols-outlined">person</span>
              <span className="text-[10px] font-bold">Profile</span>
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
