import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const correlationColorClass = (value) => {
  if (value >= 0.7) return 'bg-blue-700 text-white';
  if (value >= 0.4) return 'bg-blue-500 text-white';
  if (value >= 0.1) return 'bg-blue-200 text-blue-900';
  if (value <= -0.7) return 'bg-red-700 text-white';
  if (value <= -0.4) return 'bg-red-500 text-white';
  if (value <= -0.1) return 'bg-red-200 text-red-900';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
};

const Index = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();

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
  const [targetColumn, setTargetColumn] = useState('');
  const [predictionInputs, setPredictionInputs] = useState({});
  const [predictionOutput, setPredictionOutput] = useState('Predictions will appear here.');
  const [isPredicting, setIsPredicting] = useState(false);

  const pricingPlan = (user?.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free';
  const pricingPlanLabel = pricingPlan === 'pro' ? 'Pro Plan' : 'Free Plan';
  const workflowModeLabel = pricingPlan === 'pro' ? 'Advanced Mode' : 'Fast Mode';
  const trainRowLimit = pricingPlan === 'pro' ? 60000 : 15000;

  const safeError = async (response, fallbackMessage) => {
    try {
      const rawBody = await response.text();
      let data = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = null;
      }

      if (!data) {
        const statusPrefix = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
        const bodySnippet = rawBody ? rawBody.slice(0, 300) : 'No response body';
        return `${fallbackMessage} | ${statusPrefix} | ${bodySnippet}`;
      }

      const detail = data?.detail;

      if (Array.isArray(detail)) {
        const validationMessages = detail
          .slice(0, 5)
          .map((item) => {
            const location = Array.isArray(item?.loc) ? item.loc.join('.') : 'unknown';
            return `${location}: ${item?.msg || 'invalid value'}`;
          })
          .join(', ');
        const requestId = data?.request_id ? ` | Request ID: ${data.request_id}` : '';
        return `Request validation failed: ${validationMessages}${requestId}`;
      }

      if (typeof detail === 'string') {
        const requestId = data?.request_id ? ` (request_id: ${data.request_id})` : '';
        return `${detail}${requestId}`;
      }

      if (detail && typeof detail === 'object') {
        const lines = [];
        lines.push(detail.message || fallbackMessage);

        if (detail.code) {
          lines.push(`Code: ${detail.code}`);
        }
        if (Array.isArray(detail.invalid_numeric) && detail.invalid_numeric.length > 0) {
          lines.push(`Invalid numeric: ${detail.invalid_numeric.join(', ')}`);
        }
        if (Array.isArray(detail.errors) && detail.errors.length > 0) {
          const firstErrors = detail.errors
            .slice(0, 5)
            .map((item) => `${Array.isArray(item?.loc) ? item.loc.join('.') : 'unknown'}: ${item?.msg || 'invalid value'}`)
            .join(', ');
          lines.push(`Validation: ${firstErrors}`);
        }
        if (Array.isArray(detail.unknown_columns) && detail.unknown_columns.length > 0) {
          lines.push(`Unknown columns ignored: ${detail.unknown_columns.join(', ')}`);
        }

        const requestId = detail.request_id || data?.request_id;
        if (requestId) {
          lines.push(`Request ID: ${requestId}`);
        }

        return lines.join(' | ');
      }

      const statusPrefix = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
      return `${fallbackMessage} | ${statusPrefix}`;
    } catch {
      return `${fallbackMessage} | Unable to parse server error response`;
    }
  };

  const recordActivity = async (event, details) => {
    if (!token) return;
    try {
      await fetch('/api/user/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ event, details })
      });
    } catch {
      // Non-blocking logging helper.
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    setPageError('');
  };

  const refreshHistory = async () => {
    try {
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

  const fetchSummaryForDataset = async (id) => {
    const response = await fetch(`/summary?dataset_id=${encodeURIComponent(id)}&preview_rows=10`);
    if (!response.ok) {
      throw new Error(await safeError(response, 'Unable to load dataset summary.'));
    }
    const data = await response.json();
    const resolvedSummary = data.summary || null;
    setSummary(resolvedSummary);
    setPreviewRows(Array.isArray(data.preview_rows) ? data.preview_rows : []);

    const availableColumns = Array.isArray(resolvedSummary?.column_names) ? resolvedSummary.column_names : [];
    if (targetColumn && !availableColumns.includes(targetColumn)) {
      setTargetColumn('');
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
      await fetchSummaryForDataset(data.dataset_id);
      await refreshHistory();
      await recordActivity('dataset_uploaded', `Uploaded ${data.filename}`);
      setActiveTab('overview');
    } catch (error) {
      setPageError(error.message || 'Upload failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const runAutoml = async () => {
    try {
      setIsBusy(true);
      setPageError('');

      const id = datasetId || historyItems[0]?.dataset_id;
      if (!id) {
        throw new Error('Upload a dataset first before running AutoML.');
      }

      const queryParams = new URLSearchParams({ dataset_id: id });
      if (targetColumn) {
        queryParams.set('target_column', targetColumn);
      }

      const response = await fetch(`/run-automl?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'X-Pricing-Plan': pricingPlan
        }
      });

      if (!response.ok) {
        throw new Error(await safeError(response, 'AutoML run failed.'));
      }

      const data = await response.json();
      setDatasetId(id);
      setMlResults(data.ml_results || null);
      const resolvedTarget = data.target_column || targetColumn || 'auto(last column)';
      if (data.target_column) {
        setTargetColumn(data.target_column);
      }
      await recordActivity('automl_run', `AutoML completed for dataset ${id} with target ${resolvedTarget}`);
      setActiveTab('models');
    } catch (error) {
      setPageError(error.message || 'AutoML run failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const downloadModel = async () => {
    const id = datasetId || historyItems[0]?.dataset_id;
    if (!id) {
      setPageError('No dataset selected. Upload and run AutoML first.');
      return;
    }

    const queryParams = new URLSearchParams({ dataset_id: id });
    if (targetColumn) {
      queryParams.set('target_column', targetColumn);
    }

    window.open(`/model/download?${queryParams.toString()}`, '_blank', 'noopener,noreferrer');
    await recordActivity('model_downloaded', `Downloaded model for dataset ${id}${targetColumn ? ` with target ${targetColumn}` : ''}`);
  };

  const exportReport = async () => {
    const id = datasetId || historyItems[0]?.dataset_id;
    if (!id) {
      setPageError('No dataset selected. Upload a dataset first.');
      return;
    }

    window.open(`/report?dataset_id=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer');
    await recordActivity('report_exported', `Exported report for dataset ${id}`);
  };

  const correlation = summary?.correlation;
  const resolvedTargetColumn = mlResults?.target_column || targetColumn || '';

  const predictionColumns = useMemo(() => {
    const trainedFeatures = mlResults?.feature_metadata?.all_features;
    if (Array.isArray(trainedFeatures) && trainedFeatures.length > 0) {
      return trainedFeatures;
    }
    if (!Array.isArray(summary?.column_names)) return [];
    return summary.column_names.filter((columnName) => columnName !== resolvedTargetColumn);
  }, [mlResults, summary, resolvedTargetColumn]);

  const categoricalFeatures = useMemo(() => {
    return mlResults?.feature_metadata?.categorical_features || [];
  }, [mlResults]);

  const numericFeatures = useMemo(() => {
    return mlResults?.feature_metadata?.numeric_features || [];
  }, [mlResults]);

  const getCategoricalOptions = (columnName) => {
    if (!summary?.column_stats) return [];
    const stats = summary.column_stats[columnName];
    if (stats?.unique_values && Array.isArray(stats.unique_values)) {
      return stats.unique_values.slice(0, 100);
    }
    return [];
  };

  const getNumericLimits = (columnName) => {
    if (!summary?.column_stats) return null;
    const stats = summary.column_stats[columnName];
    if (!stats) return null;
    if (typeof stats.min !== 'number' || typeof stats.max !== 'number') return null;
    return {
      min: stats.min,
      max: stats.max,
      p01: typeof stats.p01 === 'number' ? stats.p01 : stats.min,
      p99: typeof stats.p99 === 'number' ? stats.p99 : stats.max,
    };
  };

  useEffect(() => {
    if (predictionColumns.length === 0) {
      setPredictionInputs({});
      return;
    }

    setPredictionInputs((prev) => {
      const next = {};
      predictionColumns.forEach((columnName) => {
        next[columnName] = prev[columnName] ?? '';
      });
      return next;
    });
  }, [predictionColumns]);

  const parsePredictionValue = (rawValue, columnName) => {
    const normalized = String(rawValue ?? '').trim();
    if (!normalized) return null;
    
    if (categoricalFeatures.includes(columnName)) {
      return normalized;
    }
    
    if (numericFeatures.includes(columnName)) {
      const num = Number(normalized);
      if (isNaN(num)) return null;
      return num;
    }
    
    if (/^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
    if (normalized.toLowerCase() === 'true') return true;
    if (normalized.toLowerCase() === 'false') return false;
    return normalized;
  };

  const handlePredictionInputChange = (columnName, value) => {
    setPredictionInputs((prev) => ({ ...prev, [columnName]: value }));
  };

  const runPrediction = async () => {
    const id = datasetId || historyItems[0]?.dataset_id;
    if (!id) {
      setPageError('No dataset selected. Upload and run AutoML first.');
      return;
    }

    if (!mlResults) {
      setPageError('Run AutoML before using Prediction Playground.');
      return;
    }

    try {
      setIsPredicting(true);
      setPageError('');

      const queryParams = new URLSearchParams({ dataset_id: id });
      if (resolvedTargetColumn) {
        queryParams.set('target_column', resolvedTargetColumn);
      }

      const payload = {};
      const errors = [];
      predictionColumns.forEach((columnName) => {
        const rawValue = predictionInputs[columnName];
        const hasValue = String(rawValue ?? '').trim() !== '';
        if (!hasValue) {
          return;
        }

        if (numericFeatures.includes(columnName)) {
          const value = String(rawValue ?? '').trim();
          const parsed = parsePredictionValue(value, columnName);
          if (parsed === null || isNaN(parsed)) {
            errors.push(`${columnName} must be a valid number`);
          } else {
            const limits = getNumericLimits(columnName);
            if (limits && (parsed < limits.min || parsed > limits.max)) {
              errors.push(`${columnName} must be between ${limits.min} and ${limits.max}`);
              return;
            }
            payload[columnName] = parsed;
          }
        } else {
          payload[columnName] = parsePredictionValue(rawValue, columnName);
        }
      });
      
      if (errors.length > 0) {
        setPageError(`Validation errors: ${errors.join(', ')}`);
        setIsPredicting(false);
        return;
      }

      const response = await fetch(`/predict?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await safeError(response, 'Prediction failed.'));
      }

      const data = await response.json();
      setPredictionOutput(JSON.stringify(data, null, 2));
      await recordActivity('prediction_run', `Prediction generated for dataset ${id} with target ${resolvedTargetColumn || 'auto(last column)'}`);
    } catch (error) {
      const errorMessage = error.message || 'Prediction failed.';
      setPageError(errorMessage);
      setPredictionOutput(`Prediction failed\n${errorMessage}`);
    } finally {
      setIsPredicting(false);
    }
  };

  const correlationCells = useMemo(() => {
    if (!correlation?.available || !Array.isArray(correlation.matrix) || !Array.isArray(correlation.columns)) {
      return [];
    }

    return correlation.matrix.flatMap((row, rowIndex) =>
      row.map((value, colIndex) => ({
        rowIndex,
        colIndex,
        value: Number(value) || 0,
        key: `${rowIndex}-${colIndex}`
      }))
    );
  }, [correlation]);

  const topFeatureImportance = (mlResults?.feature_importance || []).slice(0, 8);
  const maxImportance = topFeatureImportance.length > 0
    ? Math.max(...topFeatureImportance.map((item) => Number(item.importance) || 0.0001))
    : 1;

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
              <p className="text-slate-500 text-xs">{pricingPlanLabel}</p>
            </div>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Navigation</h2>
              <button type="button" onClick={() => setMobileNavOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <nav className="space-y-2">
              <button onClick={() => handleTabChange('overview')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Overview</button>
              <button onClick={() => handleTabChange('data')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Datasets</button>
              <button onClick={() => handleTabChange('models')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Models</button>
              <button onClick={() => navigate('/profile')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">Profile</button>
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

              <select
                value={targetColumn}
                onChange={async (event) => {
                  const nextValue = event.target.value;
                  setTargetColumn(nextValue);
                  await recordActivity(
                    'target_column_changed',
                    nextValue
                      ? `Target column set to ${nextValue}`
                      : 'Target column switched to automatic (last column)'
                  );
                }}
                className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs bg-white dark:bg-slate-900"
              >
                <option value="">Target (auto: last column)</option>
                {(summary?.column_names || []).map((columnName) => (
                  <option key={columnName} value={columnName}>{columnName}</option>
                ))}
              </select>

              <button className="shrink-0 border border-primary text-primary px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/10" type="button" onClick={uploadCsv} disabled={isBusy}>
                Upload CSV
              </button>

              <button className="shrink-0 bg-primary text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:opacity-90 disabled:opacity-60" type="button" onClick={runAutoml} disabled={isBusy}>
                {isBusy ? 'Working...' : 'Run AutoML'}
              </button>

              <button className="shrink-0 border border-slate-300 dark:border-slate-700 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800" type="button" onClick={downloadModel}>
                Download Model
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
          <p className="text-xs text-slate-500 mt-1">Target Column: {targetColumn || 'Auto (last column)'}</p>
          <p className="text-xs text-slate-500 mt-1">Workflow: {workflowModeLabel} ({pricingPlanLabel}) | Train rows cap: {trainRowLimit.toLocaleString()}</p>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto flex-1 w-full">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Rows</p>
                  <p className="text-3xl font-bold mt-2">{summary?.rows ?? '-'}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Total Columns</p>
                  <p className="text-3xl font-bold mt-2">{summary?.columns ?? '-'}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Missing Values</p>
                  <p className="text-3xl font-bold mt-2">{summary?.total_missing_values ?? '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="font-bold flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-primary">grid_view</span>
                    Correlation Matrix
                  </h3>

                  {!correlation?.available ? (
                    <p className="text-sm text-slate-500">Upload a dataset with numeric columns to render the correlation heatmap.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-8 gap-1">
                        {correlationCells.map((cell) => (
                          <div key={cell.key} className={`aspect-square rounded text-[10px] flex items-center justify-center ${correlationColorClass(cell.value)}`}>
                            {cell.value.toFixed(2)}
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 space-y-1">
                        {(correlation.top_pairs || []).slice(0, 5).map((pair, idx) => (
                          <p key={`${pair.feature_1}-${pair.feature_2}-${idx}`}>
                            {pair.feature_1} vs {pair.feature_2}: {pair.correlation}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="font-bold flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-primary">bar_chart</span>
                    Feature Importance
                  </h3>

                  {topFeatureImportance.length === 0 ? (
                    <p className="text-sm text-slate-500">Run AutoML to populate feature importance list.</p>
                  ) : (
                    <div className="space-y-3">
                      {topFeatureImportance.map((item) => {
                        const importance = Number(item.importance) || 0;
                        const width = Math.max(4, (importance / maxImportance) * 100);
                        return (
                          <div key={item.feature}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="truncate mr-2">{item.feature}</span>
                              <span>{importance.toFixed(4)}</span>
                            </div>
                            <div className="w-full h-2 rounded bg-slate-100 dark:bg-slate-700">
                              <div className="h-2 rounded bg-primary" style={{ width: `${width}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                        onClick={async () => {
                          setDatasetId(item.dataset_id);
                          setDatasetInfo({ filename: item.filename, rows: item.rows, columns: item.columns, dataset_id: item.dataset_id });
                          await fetchSummaryForDataset(item.dataset_id);
                          await recordActivity('dataset_selected', `Selected dataset ${item.filename} (${item.dataset_id})`);
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
                <h4 className="font-semibold mb-3">AutoML Model Leaderboard</h4>
                {mlResults?.model_scores?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                          <th className="px-3 py-2">Rank</th>
                          <th className="px-3 py-2">Model</th>
                          <th className="px-3 py-2">Metric</th>
                          <th className="px-3 py-2">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {mlResults.model_scores.map((model, index) => (
                          <tr key={`${model.model_name}-${index}`}>
                            <td className="px-3 py-2 font-semibold">#{index + 1}</td>
                            <td className="px-3 py-2">{model.model_name}</td>
                            <td className="px-3 py-2">{model.metric_name}</td>
                            <td className="px-3 py-2 font-medium">{model.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Run AutoML to see model outputs.</p>
                )}

                {mlResults && (
                  <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p>Workflow Mode: {mlResults.workflow_mode || workflowModeLabel}</p>
                    <p>Pricing Plan: {(mlResults.pricing_plan || pricingPlan).toUpperCase()}</p>
                    <p>Training Rows Used: {(mlResults.trained_rows || 0).toLocaleString()}</p>
                    <p>Training Row Cap: {(mlResults.plan_limits?.max_train_rows || trainRowLimit).toLocaleString()}</p>
                    <p>Advanced Models: {mlResults.plan_limits?.advanced_models_enabled ? 'Enabled' : 'Not available on this plan'}</p>
                    <p>Cross-Validation: {mlResults.plan_limits?.cross_validation_folds ? `${mlResults.plan_limits.cross_validation_folds}-fold` : 'Disabled on this plan'}</p>
                    <p>Hyperparameter Tuning: {mlResults.hyperparameter_tuning?.enabled ? 'Enabled (RandomizedSearchCV)' : 'Disabled on this plan'}</p>
                    <p>Workflow Steps Executed: {(mlResults.workflow_steps || []).length}</p>
                    {(mlResults.workflow_steps_skipped || []).length > 0 && (
                      <p>Workflow Steps Skipped: {(mlResults.workflow_steps_skipped || []).join(', ')}</p>
                    )}
                  </div>
                )}

                {(mlResults?.leakage_feature_columns || []).length > 0 && (
                  <div className="mt-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                    <p className="font-semibold">Leakage Guard Applied</p>
                    <p>
                      Dropped potential target-leakage features: {mlResults.leakage_feature_columns.join(', ')}
                    </p>
                    <p>
                      This helps prevent overly optimistic scores and improves generalization on new data.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                <h4 className="font-semibold mb-2">Prediction Playground</h4>
                <p className="text-xs text-slate-500 mb-4">Run a single-record prediction using your trained model.</p>

                {!mlResults ? (
                  <p className="text-sm text-slate-500">Run AutoML to generate prediction inputs.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {predictionColumns.length === 0 ? (
                        <p className="text-sm text-slate-500 md:col-span-2">No feature columns available for prediction.</p>
                      ) : (
                        predictionColumns.map((columnName) => {
                          const isCategorical = categoricalFeatures.includes(columnName);
                          const isNumeric = numericFeatures.includes(columnName);
                          const options = isCategorical ? getCategoricalOptions(columnName) : [];
                          const numericLimits = isNumeric ? getNumericLimits(columnName) : null;
                          const useDropdown = isCategorical && options.length > 0;
                          
                          return (
                            <label key={columnName} className="flex flex-col gap-1 text-xs">
                              <span className="text-slate-600 dark:text-slate-300">
                                {columnName}
                                {isCategorical && <span className="text-xs text-slate-500 ml-1">(categorical)</span>}
                                {isNumeric && <span className="text-xs text-slate-500 ml-1">(numeric)</span>}
                              </span>
                              {useDropdown ? (
                                <select
                                  value={predictionInputs[columnName] ?? ''}
                                  onChange={(event) => handlePredictionInputChange(columnName, event.target.value)}
                                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                >
                                  <option value="">-- Select {columnName} --</option>
                                  {options.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : isNumeric ? (
                                <input
                                  type="number"
                                  value={predictionInputs[columnName] ?? ''}
                                  onChange={(event) => handlePredictionInputChange(columnName, event.target.value)}
                                  min={numericLimits?.min}
                                  max={numericLimits?.max}
                                  step="any"
                                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                  placeholder={numericLimits ? `Range ${numericLimits.min} to ${numericLimits.max}` : `Enter numeric value for ${columnName}`}
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={predictionInputs[columnName] ?? ''}
                                  onChange={(event) => handlePredictionInputChange(columnName, event.target.value)}
                                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                  placeholder={isCategorical ? `Enter ${columnName}` : `Enter value for ${columnName}`}
                                />
                              )}
                              {isNumeric && numericLimits && (
                                <span className="text-[10px] text-slate-500">Allowed range: {numericLimits.min} to {numericLimits.max}</span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <button
                        type="button"
                        onClick={runPrediction}
                        disabled={isPredicting}
                        className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        {isPredicting ? 'Predicting...' : 'Predict'}
                      </button>
                      <span className="text-xs text-slate-500">Target: {resolvedTargetColumn || 'Auto (last column)'}</span>
                    </div>

                    <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-auto">{predictionOutput}</pre>
                  </>
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
