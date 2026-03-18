import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pageError, setPageError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [datasetId, setDatasetId] = useState('');
  const [datasetInfo, setDatasetInfo] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [mlResults, setMlResults] = useState(null);

  const safeError = async (response, fallbackMessage) => {
    try {
      const data = await response.json();
      return data?.detail || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  };

  const recordActivity = async (event, details) => {
    if (!token) return;
    try {
      await fetch('/api/user/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ event, details })
      });
    } catch {
      // Non-blocking audit helper.
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    setPageError('');
  };

  const handleLogout = () => {
    try {
      logout();
      navigate('/landing');
    } catch {
      setPageError('Unable to log out right now. Please refresh and try again.');
    }
  };

  const refreshHistory = async () => {
    try {
      setPageError('');
      const response = await fetch('/datasets');
      if (!response.ok) {
        throw new Error(await safeError(response, 'Failed to refresh dataset history.'));
      }
      const data = await response.json();
      setHistoryItems(Array.isArray(data?.datasets) ? data.datasets : []);
    } catch (error) {
      setPageError(error.message || 'Unable to refresh dataset history.');
    }
  };

  const uploadCsv = async () => {
    if (!selectedFile) {
      setPageError('Please choose a CSV file before uploading.');
      return;
    }

    try {
      setIsBusy(true);
      setPageError('');

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await safeError(response, 'CSV upload failed.'));
      }

      const data = await response.json();
      setDatasetId(data.dataset_id);
      setDatasetInfo(data);
      await recordActivity('dataset_uploaded', `Uploaded ${data.filename}`);

      const summaryResponse = await fetch(`/summary?dataset_id=${encodeURIComponent(data.dataset_id)}&preview_rows=5`);
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        setSummary(summaryData.summary || null);
        setPreviewRows(Array.isArray(summaryData.preview_rows) ? summaryData.preview_rows : []);
      }

      await refreshHistory();
      setActiveTab('overview');
    } catch (error) {
      setPageError(error.message || 'Upload failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const runAutoml = async () => {
    if (!datasetId) {
      setPageError('Upload a dataset first before running AutoML.');
      return;
    }

    try {
      setIsBusy(true);
      setPageError('');
      const response = await fetch(`/run-automl?dataset_id=${encodeURIComponent(datasetId)}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(await safeError(response, 'AutoML run failed.'));
      }

      const data = await response.json();
      setMlResults(data.ml_results || null);
      await recordActivity('automl_run', `AutoML completed for dataset ${datasetId}`);
      setActiveTab('models');
    } catch (error) {
      setPageError(error.message || 'AutoML run failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const downloadModel = () => {
    if (!datasetId) {
      setPageError('No dataset selected. Upload and run AutoML first.');
      return;
    }
    window.open(`/model/download?dataset_id=${encodeURIComponent(datasetId)}`, '_blank', 'noopener,noreferrer');
    recordActivity('model_downloaded', `Downloaded model for dataset ${datasetId}`);
  };

  const exportReport = () => {
    if (!datasetId) {
      setPageError('No dataset selected. Upload a dataset first.');
      return;
    }
    window.open(`/report?dataset_id=${encodeURIComponent(datasetId)}`, '_blank', 'noopener,noreferrer');
    recordActivity('report_exported', `Exported report for dataset ${datasetId}`);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen md:h-screen flex overflow-hidden">
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg text-white">
            <span className="material-symbols-outlined block">analytics</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">AutoML</h1>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => handleTabChange('overview')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg font-semibold transition-colors ${activeTab === 'overview' ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined">dashboard</span>
            <span>Overview</span>
          </button>
          <button onClick={() => handleTabChange('data')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'data' ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined">table_chart</span>
            <span>Datasets</span>
          </button>
          <button onClick={() => handleTabChange('models')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'models' ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <span className="material-symbols-outlined">model_training</span>
            <span>Models</span>
          </button>
          <button onClick={() => navigate('/settings')} className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <span className="material-symbols-outlined">settings</span>
            <span>Settings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button type="button" onClick={() => navigate('/profile')} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left bg-primary/10 text-primary font-semibold hover:bg-primary/15 transition-colors">
            <span className="material-symbols-outlined text-base">person</span>
            <span className="text-sm">Profile</span>
          </button>
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg">
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

      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col">
            <nav className="space-y-2">
              <button onClick={() => handleTabChange('overview')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Overview</button>
              <button onClick={() => handleTabChange('data')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Datasets</button>
              <button onClick={() => handleTabChange('models')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Models</button>
              <button onClick={() => navigate('/profile')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Profile</button>
              <button onClick={() => navigate('/settings')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Settings</button>
              <button onClick={handleLogout} className="w-full text-left px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">Logout</button>
            </nav>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto flex flex-col">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="md:hidden rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h2 className="text-base sm:text-lg font-bold">{datasetInfo?.filename || 'No dataset uploaded'}</h2>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${datasetId ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
              {datasetId ? 'READY' : 'PENDING'}
            </span>
          </div>

          <div className="w-full md:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 flex-nowrap md:flex-wrap overflow-x-auto pb-1 md:pb-0">
              <button className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800" type="button" onClick={exportReport}>
                <span className="material-symbols-outlined text-base">cloud_download</span>
                <span className="hidden sm:inline">Export Report</span>
              </button>

              <div className="relative shrink-0">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  className="block w-40 sm:w-48 text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary hover:file:bg-primary/20"
                />
              </div>

              <button className="shrink-0 border border-primary text-primary px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/10" type="button" onClick={uploadCsv} disabled={isBusy}>
                Upload CSV
              </button>

              <button className="shrink-0 bg-primary text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:opacity-90 disabled:opacity-60" type="button" onClick={runAutoml} disabled={isBusy}>
                {isBusy ? 'Working...' : 'Run AutoML'}
              </button>

              <button className="shrink-0 border border-slate-300 dark:border-slate-700 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800" type="button" onClick={downloadModel}>
                Download Model
              </button>

              <button className="shrink-0 border border-slate-300 dark:border-slate-700 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800" type="button" onClick={() => navigate('/settings')}>
                Settings
              </button>

              <button className="shrink-0 border border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20" type="button" onClick={handleLogout}>
                Logout
              </button>
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

        <div className="px-4 sm:px-6 pt-3">
          <p className="text-xs text-slate-500">Upload a CSV file to begin.</p>
          {datasetInfo && (
            <p className="text-xs text-slate-500 mt-1">Rows: {datasetInfo.rows} | Columns: {datasetInfo.columns} | Dataset ID: {datasetInfo.dataset_id}</p>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto flex-1 w-full">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                <h3 className="font-semibold mb-2">Dataset Summary</h3>
                {summary ? (
                  <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-auto">{JSON.stringify(summary, null, 2)}</pre>
                ) : (
                  <p className="text-sm text-slate-500">No summary available yet. Upload a CSV first.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Dataset History</h4>
                  <button className="text-xs text-primary hover:underline" type="button" onClick={refreshHistory}>Refresh</button>
                </div>
                <div className="space-y-2 text-xs">
                  {historyItems.length === 0 ? (
                    <p className="text-slate-500">No datasets in history.</p>
                  ) : (
                    historyItems.map((item) => (
                      <button
                        key={item.dataset_id}
                        type="button"
                        onClick={() => {
                          setDatasetId(item.dataset_id);
                          setDatasetInfo({ filename: item.filename, rows: item.rows, columns: item.columns, dataset_id: item.dataset_id });
                        }}
                        className="w-full text-left p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {item.filename} ({item.rows}x{item.columns})
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                <h4 className="font-semibold mb-3">Preview Rows</h4>
                {previewRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No preview rows available.</p>
                ) : (
                  <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-auto">{JSON.stringify(previewRows, null, 2)}</pre>
                )}
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                <h4 className="font-semibold mb-3">AutoML Results</h4>
                {mlResults ? (
                  <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-auto">{JSON.stringify(mlResults, null, 2)}</pre>
                ) : (
                  <p className="text-sm text-slate-500">Run AutoML to see model outputs.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
