const datasetFileInput = document.getElementById("datasetFile");
const uploadBtn = document.getElementById("uploadBtn");
const runAutomlBtn = document.getElementById("runAutomlBtn");
const exportReportBtn = document.getElementById("exportReportBtn");
const downloadModelBtn = document.getElementById("downloadModelBtn");
const refreshDatasetsBtn = document.getElementById("refreshDatasetsBtn");
const targetColumnSelect = document.getElementById("targetColumnSelect");
const predictBtn = document.getElementById("predictBtn");
const dropZone = document.getElementById("dropZone");
const errorBanner = document.getElementById("errorBanner");
const appStatus = document.getElementById("appStatus");
const pipelineNotes = document.getElementById("pipelineNotes");
const progressStatus = document.getElementById("progressStatus");
const datasetName = document.getElementById("datasetName");
const datasetStatus = document.getElementById("datasetStatus");
const emptyState = document.getElementById("emptyState");
const datasetHistoryList = document.getElementById("datasetHistoryList");
const predictionFormContainer = document.getElementById("predictionFormContainer");
const predictionOutput = document.getElementById("predictionOutput");
const predictionStatus = document.getElementById("predictionStatus");

const rowsValue = document.getElementById("rowsValue");
const columnsValue = document.getElementById("columnsValue");
const columnSplit = document.getElementById("columnSplit");
const missingValue = document.getElementById("missingValue");
const targetInfo = document.getElementById("targetInfo");

const modelTableBody = document.getElementById("modelTableBody");
const featureImportanceContainer = document.getElementById("featureImportanceContainer");
const previewTable = document.getElementById("previewTable");
const previewMeta = document.getElementById("previewMeta");
const filterRowsInput = document.getElementById("filterRowsInput");
const correlationGrid = document.getElementById("correlationGrid");
const correlationPairs = document.getElementById("correlationPairs");
const tabLinks = document.querySelectorAll("[data-tab-link]");
const tabContents = document.querySelectorAll("[data-tab-content]");

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

let previewColumns = [];
let previewRows = [];
let activeDatasetId = null;
let selectedFile = null;
let predictionFeatures = [];

function setStatus(message, isError = false) {
  appStatus.textContent = message;
  appStatus.className = `text-xs ${isError ? "text-red-500" : "text-slate-500"}`;
}

function setProgress(message) {
  progressStatus.textContent = message;
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.classList.add("hidden");
  errorBanner.textContent = "";
}

function setPipelineNotes(message, isWarning = false) {
  pipelineNotes.textContent = message;
  pipelineNotes.className = `text-xs mt-1 ${isWarning ? "text-amber-600" : "text-slate-500"}`;
}

function setDatasetState(uploaded) {
  if (uploaded) {
    datasetStatus.textContent = "UPLOADED";
    datasetStatus.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    emptyState.classList.add("hidden");
  } else {
    datasetStatus.textContent = "PENDING";
    datasetStatus.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    emptyState.classList.remove("hidden");
  }

  exportReportBtn.disabled = !uploaded;
  downloadModelBtn.disabled = !uploaded;
  [exportReportBtn, downloadModelBtn].forEach((btn) => {
    btn.classList.toggle("opacity-50", !uploaded);
    btn.classList.toggle("cursor-not-allowed", !uploaded);
  });
}

function setAutomlStateComplete() {
  datasetStatus.textContent = "PROCESSED";
  datasetStatus.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}

async function apiCall(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  let payload = {};

  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = { error: text || "Request failed." };
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "Request failed.");
  }

  return payload;
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    return payload.error || payload.detail || "Request failed.";
  }
  const text = await response.text();
  return text || "Request failed.";
}

async function recoverLatestDatasetId() {
  const payload = await apiCall("/datasets");
  const datasets = payload.datasets || [];
  if (!datasets.length) {
    throw new Error("No datasets available. Please upload again.");
  }
  activeDatasetId = datasets[0].dataset_id;
  setDatasetState(true);
  await loadSummary();
  return activeDatasetId;
}

function validateFile(file) {
  if (!file) {
    throw new Error("Please select a file.");
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Only CSV files are supported.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File too large. Max size is 50 MB.");
  }
}

function buildPredictionForm() {
  if (!predictionFeatures.length) {
    predictionFormContainer.innerHTML = '<p class="text-sm text-slate-500 md:col-span-2">Run AutoML to generate prediction inputs.</p>';
    predictionStatus.textContent = "Awaiting model training.";
    return;
  }

  const sampleRow = previewRows[0] || {};
  predictionFormContainer.innerHTML = predictionFeatures
    .map((feature) => {
      const sampleValue = sampleRow[feature];
      const isNumeric = typeof sampleValue === "number";
      const inputType = isNumeric ? "number" : "text";
      const placeholder = sampleValue === undefined || sampleValue === null ? "" : String(sampleValue);
      return `
      <label class="block">
        <span class="text-xs font-medium text-slate-600 dark:text-slate-300">${feature}</span>
        <input
          class="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          type="${inputType}"
          data-predict-field="${feature}"
          placeholder="${placeholder}"
        />
      </label>`;
    })
    .join("");
  predictionStatus.textContent = "Fill input values and click Predict.";
}

function collectPredictionRecord() {
  const record = {};
  const inputs = predictionFormContainer.querySelectorAll("[data-predict-field]");
  inputs.forEach((input) => {
    const key = input.getAttribute("data-predict-field");
    if (!key) {
      return;
    }
    const raw = input.value.trim();
    if (raw === "") {
      return;
    }
    record[key] = input.type === "number" ? Number(raw) : raw;
  });
  return record;
}

function renderPreview(columns, rows) {
  if (!columns.length) {
    previewTable.innerHTML = "";
    previewMeta.textContent = "Showing 0 entries";
    return;
  }

  const head = `
    <thead class="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
      <tr>${columns.map((col) => `<th class="px-6 py-3 border-b border-slate-200 dark:border-slate-800">${col}</th>`).join("")}</tr>
    </thead>`;

  const bodyRows = rows
    .map((row) => `<tr>${columns.map((col) => `<td class="px-6 py-4 border-t border-slate-100 dark:border-slate-800">${row[col] ?? ""}</td>`).join("")}</tr>`)
    .join("");

  previewTable.innerHTML = `${head}<tbody class="divide-y divide-slate-100 dark:divide-slate-800">${bodyRows || ""}</tbody>`;
  previewMeta.textContent = `Showing ${rows.length} entries`;
}

function applyPreviewFilter() {
  const query = filterRowsInput.value.trim().toLowerCase();
  if (!query) {
    renderPreview(previewColumns, previewRows);
    return;
  }

  const filteredRows = previewRows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query))
  );
  renderPreview(previewColumns, filteredRows);
}

function renderFeatureImportance(items) {
  if (!items.length) {
    featureImportanceContainer.innerHTML = "<p class='text-sm text-slate-500 dark:text-slate-400'>No feature importance available.</p>";
    return;
  }

  featureImportanceContainer.innerHTML = items
    .map((item) => {
      const pct = Math.max(0, Math.min(100, item.importance * 100));
      return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs font-medium mb-1">
          <span class="truncate max-w-[70%]" title="${item.feature}">${item.feature}</span>
          <span>${pct.toFixed(2)}%</span>
        </div>
        <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-primary rounded-full" style="width: ${pct.toFixed(2)}%"></div>
        </div>
      </div>`;
    })
    .join("");
}

function renderLeaderboard(scores) {
  if (!scores.length) {
    modelTableBody.innerHTML = '<tr><td class="px-6 py-4" colspan="6">No model results found.</td></tr>';
    return;
  }

  modelTableBody.innerHTML = scores
    .map((row, index) => {
      const status = index === 0 ? "OPTIMAL" : "CANDIDATE";
      const statusStyle = index === 0
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

      let extraMetric = "-";
      if (row.metric_name === "accuracy") {
        extraMetric = `P:${(row.precision ?? 0).toFixed(3)} R:${(row.recall ?? 0).toFixed(3)} F1:${(row.f1_score ?? 0).toFixed(3)}`;
      }
      if (row.metric_name === "r2") {
        extraMetric = `MAE:${row.mae ?? "-"}`;
      }

      return `
      <tr>
        <td class="px-6 py-4"><span class="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white font-bold text-xs">${index + 1}</span></td>
        <td class="px-6 py-4 font-semibold">${row.model_name}</td>
        <td class="px-6 py-4 uppercase text-xs tracking-wide">${row.metric_name}</td>
        <td class="px-6 py-4 font-mono">${row.score.toFixed(4)}</td>
        <td class="px-6 py-4 text-xs">${extraMetric}</td>
        <td class="px-6 py-4 text-right"><span class="px-2 py-1 rounded text-[10px] font-bold ${statusStyle}">${status}</span></td>
      </tr>`;
    })
    .join("");
}

function renderCorrelation(correlationData) {
  if (!correlationData || !correlationData.available) {
    correlationGrid.innerHTML = '<div class="col-span-6 text-center text-xs text-slate-500 self-center">Not enough numeric columns for correlation.</div>';
    correlationPairs.textContent = "Top correlated pairs will appear here.";
    return;
  }

  const matrix = correlationData.matrix || [];
  const size = matrix.length || 1;
  correlationGrid.className = "grid gap-1 w-full h-full p-4 opacity-80";
  correlationGrid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(size, 8))}, minmax(0, 1fr))`;

  const cells = [];
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const value = Number(matrix[i][j] ?? 0);
      const intensity = Math.min(95, Math.max(10, Math.round(Math.abs(value) * 95)));
      const shade = value >= 0 ? `rgba(19,73,236,${intensity / 120})` : `rgba(239,68,68,${intensity / 120})`;
      cells.push(`<div class="rounded-sm" title="${value.toFixed(3)}" style="background:${shade}"></div>`);
    }
  }
  correlationGrid.innerHTML = cells.join("");

  const topPair = (correlationData.top_pairs || [])[0];
  correlationPairs.textContent = topPair
    ? `Top pair: ${topPair.feature_1} vs ${topPair.feature_2} (corr=${topPair.correlation})`
    : "No strong pair found.";
}

function switchTab(tabName) {
  tabContents.forEach((section) => {
    const show = section.getAttribute("data-tab-content") === tabName;
    section.classList.toggle("hidden", !show);
  });
}

function resetResultSections() {
  targetInfo.textContent = "Target: -";
  featureImportanceContainer.innerHTML = "<p class='text-sm text-slate-500 dark:text-slate-400'>Feature importance will appear after running AutoML.</p>";
  modelTableBody.innerHTML = '<tr><td class="px-6 py-4" colspan="6">No model results yet. Upload a dataset and run AutoML.</td></tr>';
  renderCorrelation(null);
  setPipelineNotes("Pipeline notes will appear here.");
  predictionFeatures = [];
  buildPredictionForm();
  predictionOutput.textContent = "Predictions will appear here.";
}

function populateTargetSelector(columns, selected = "") {
  targetColumnSelect.innerHTML = '<option value="">Target (auto: last column)</option>';
  columns.forEach((col) => {
    const option = document.createElement("option");
    option.value = col;
    option.textContent = col;
    if (selected && selected === col) {
      option.selected = true;
    }
    targetColumnSelect.appendChild(option);
  });
}

async function loadDatasetHistory() {
  const payload = await apiCall("/datasets");
  const datasets = payload.datasets || [];
  if (!datasets.length) {
    datasetHistoryList.innerHTML = '<p class="text-slate-500">No datasets in history.</p>';
    return;
  }

  datasetHistoryList.innerHTML = datasets
    .map((item) => {
      return `<div class="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
        <button type="button" class="text-left hover:text-primary" data-load-dataset="${item.dataset_id}">
          <div class="font-medium">${item.filename}</div>
          <div class="text-slate-500">${item.rows} rows, ${item.columns} cols</div>
        </button>
        <button type="button" class="text-red-500 hover:underline" data-delete-dataset="${item.dataset_id}">Delete</button>
      </div>`;
    })
    .join("");
}

async function loadSummary() {
  if (!activeDatasetId) {
    throw new Error("No active dataset available.");
  }

  const payload = await apiCall(`/summary?dataset_id=${encodeURIComponent(activeDatasetId)}`);
  const summary = payload.summary;

  datasetName.textContent = payload.filename;
  rowsValue.textContent = summary.rows.toLocaleString();
  columnsValue.textContent = summary.columns.toLocaleString();
  missingValue.textContent = `${summary.missing_percentage}%`;
  columnSplit.textContent = `${summary.column_names.length} columns loaded`;

  previewColumns = summary.column_names;
  previewRows = payload.preview_rows || [];
  renderPreview(previewColumns, previewRows);
  renderCorrelation(summary.correlation);
  populateTargetSelector(summary.column_names, targetColumnSelect.value || "");

  if (payload.summary_cache_hit) {
    setPipelineNotes("Summary loaded from cache for faster response.");
  }
}

async function handleUpload() {
  try {
    hideError();
    const file = selectedFile || datasetFileInput.files[0];
    validateFile(file);

    setProgress("Step 1/3: Uploading and validating dataset...");
    setStatus("Uploading dataset...");
    uploadBtn.disabled = true;
    runAutomlBtn.disabled = true;
    resetResultSections();

    const formData = new FormData();
    formData.append("file", file);
    const payload = await apiCall("/upload", { method: "POST", body: formData });
    activeDatasetId = payload.dataset_id;

    setDatasetState(true);
    datasetName.textContent = payload.filename;
    setStatus(`Upload complete in ${payload.parse_time_ms} ms.`);
    setProgress("Step 2/3: Building summary and quality diagnostics...");
    await loadSummary();
    await loadDatasetHistory();
    setProgress("Step 3/3: Ready to run AutoML.");
  } catch (error) {
    showError(error.message);
    setStatus(error.message, true);
    setDatasetState(false);
  } finally {
    uploadBtn.disabled = false;
    runAutomlBtn.disabled = false;
  }
}

async function runAutoml() {
  if (!activeDatasetId) {
    showError("Upload a dataset before running AutoML.");
    setStatus("Upload a dataset before running AutoML.", true);
    return;
  }

  setStatus("Running AutoML models. This may take a moment...");
  setProgress("Step 1/2: Training models...");
  runAutomlBtn.disabled = true;
  runAutomlBtn.classList.add("opacity-60", "cursor-not-allowed");

  try {
    hideError();
    const target = targetColumnSelect.value ? `&target_column=${encodeURIComponent(targetColumnSelect.value)}` : "";
    const payload = await apiCall(`/run-automl?dataset_id=${encodeURIComponent(activeDatasetId)}${target}`, { method: "POST" });
    const results = payload.ml_results;

    targetInfo.textContent = `Target: ${results.target_column}`;
    columnSplit.textContent = `${results.numeric_feature_count} numerical | ${results.categorical_feature_count} categorical`;
    predictionFeatures = previewColumns.filter((col) => col !== results.target_column);
    buildPredictionForm();

    renderFeatureImportance(results.feature_importance || []);
    renderLeaderboard(results.model_scores || []);

    const quality = results.quality_score || {};
    const notes = [];
    if ((results.dropped_feature_columns || []).length > 0) {
      notes.push(`Dropped high-cardinality columns: ${results.dropped_feature_columns.join(", ")}`);
    }
    if (quality.score !== undefined) {
      notes.push(`Dataset quality score: ${quality.score}/100`);
    }
    if ((results.auto_insights || []).length > 0) {
      notes.push(`Insight: ${results.auto_insights[0]}`);
    }
    if (payload.automl_cache_hit) {
      notes.push("AutoML results returned from cache.");
    }
    setPipelineNotes(notes.join(" | ") || "All models executed successfully.", notes.length > 0);

    setAutomlStateComplete();
    setProgress("Step 2/2: Training complete. Results rendered.");
    setStatus(`AutoML complete for ${payload.filename} in ${results.execution_time_ms} ms.`);
    switchTab("models");
  } catch (error) {
    showError(error.message);
    setStatus(error.message, true);
  } finally {
    runAutomlBtn.disabled = false;
    runAutomlBtn.classList.remove("opacity-60", "cursor-not-allowed");
  }
}

async function runPrediction() {
  if (!activeDatasetId) {
    showError("Upload a dataset and run AutoML before prediction.");
    return;
  }

  if (!predictionFeatures.length) {
    showError("Prediction inputs are not ready. Run AutoML first.");
    return;
  }

  try {
    hideError();
    predictionStatus.textContent = "Running prediction...";
    predictBtn.disabled = true;
    predictBtn.classList.add("opacity-60", "cursor-not-allowed");

    const target = targetColumnSelect.value ? `&target_column=${encodeURIComponent(targetColumnSelect.value)}` : "";
    const record = collectPredictionRecord();
    const payload = await apiCall(`/predict?dataset_id=${encodeURIComponent(activeDatasetId)}${target}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([record]),
    });

    predictionOutput.textContent = JSON.stringify(payload, null, 2);
    predictionStatus.textContent = `Prediction complete (${payload.count} row).`;
  } catch (error) {
    showError(error.message);
    predictionStatus.textContent = "Prediction failed.";
  } finally {
    predictBtn.disabled = false;
    predictBtn.classList.remove("opacity-60", "cursor-not-allowed");
  }
}

async function exportReport() {
  if (!activeDatasetId) {
    showError("Upload a dataset before exporting report.");
    return;
  }

  try {
    hideError();
    setStatus("Preparing report export...");
    let response = await fetch(`/report?dataset_id=${encodeURIComponent(activeDatasetId)}`);
    if (response.status === 404) {
      const maybeError = await parseErrorResponse(response);
      if (String(maybeError).toLowerCase().includes("dataset not found")) {
        await recoverLatestDatasetId();
        response = await fetch(`/report?dataset_id=${encodeURIComponent(activeDatasetId)}`);
      }
    }
    if (!response.ok) {
      const message = await parseErrorResponse(response);
      throw new Error(message || "Failed to export report.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${datasetName.textContent || "dataset"}_report.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Report exported successfully.");
  } catch (error) {
    showError(error.message);
    setStatus(error.message, true);
  }
}

async function downloadModel() {
  if (!activeDatasetId) {
    showError("Run AutoML before downloading model.");
    return;
  }

  try {
    hideError();
    const target = targetColumnSelect.value ? `&target_column=${encodeURIComponent(targetColumnSelect.value)}` : "";
    let response = await fetch(`/model/download?dataset_id=${encodeURIComponent(activeDatasetId)}${target}`);
    if (response.status === 404) {
      const maybeError = await parseErrorResponse(response);
      if (String(maybeError).toLowerCase().includes("dataset not found")) {
        await recoverLatestDatasetId();
        response = await fetch(`/model/download?dataset_id=${encodeURIComponent(activeDatasetId)}${target}`);
      }
    }
    if (!response.ok) {
      const message = await parseErrorResponse(response);
      throw new Error(message || "Failed to download model.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${datasetName.textContent || "model"}.pkl`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Model downloaded successfully.");
  } catch (error) {
    showError(error.message);
    setStatus(error.message, true);
  }
}

async function handleHistoryClick(event) {
  const loadBtn = event.target.closest("[data-load-dataset]");
  if (loadBtn) {
    activeDatasetId = loadBtn.getAttribute("data-load-dataset");
    setDatasetState(true);
    setStatus("Loading selected dataset from history...");
    await loadSummary();
    switchTab("overview");
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-dataset]");
  if (deleteBtn) {
    const datasetId = deleteBtn.getAttribute("data-delete-dataset");
    await apiCall(`/dataset?dataset_id=${encodeURIComponent(datasetId)}`, { method: "DELETE" });
    if (activeDatasetId === datasetId) {
      activeDatasetId = null;
      setDatasetState(false);
      resetResultSections();
      datasetName.textContent = "No dataset uploaded";
      setStatus("Dataset deleted.");
    }
    await loadDatasetHistory();
  }
}

function onFilePicked(file) {
  try {
    validateFile(file);
    selectedFile = file;
    setStatus(`Selected ${file.name}. Click Upload CSV.`);
    hideError();
  } catch (error) {
    showError(error.message);
  }
}

datasetFileInput.addEventListener("change", () => {
  const file = datasetFileInput.files[0];
  if (file) {
    onFilePicked(file);
  }
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("ring-2", "ring-primary");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("ring-2", "ring-primary");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("ring-2", "ring-primary");
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    onFilePicked(file);
  }
});

uploadBtn.addEventListener("click", handleUpload);
runAutomlBtn.addEventListener("click", runAutoml);
exportReportBtn.addEventListener("click", exportReport);
downloadModelBtn.addEventListener("click", downloadModel);
predictBtn.addEventListener("click", runPrediction);
refreshDatasetsBtn.addEventListener("click", loadDatasetHistory);
datasetHistoryList.addEventListener("click", handleHistoryClick);
filterRowsInput.addEventListener("input", applyPreviewFilter);
tabLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab(link.getAttribute("data-tab-link"));
  });
});

setDatasetState(false);
switchTab("overview");
loadDatasetHistory().catch(() => {});

// Logout function
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

// Open settings (placeholder for now)
function openSettings(event) {
  event.preventDefault();
  alert("Settings page coming soon! (Admin features, preferences, etc.)");
}

// Load and display user info
function loadUserInfo() {
  const userStr = localStorage.getItem("user");
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      const sidebarUserEmail = document.getElementById("sidebarUserEmail");
      if (sidebarUserEmail) {
        sidebarUserEmail.textContent = user.email || "User";
      }
    } catch (e) {
      console.error("Failed to parse user info:", e);
    }
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", loadUserInfo);
