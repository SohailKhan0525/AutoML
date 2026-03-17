const datasetFileInput = document.getElementById("datasetFile");
const uploadBtn = document.getElementById("uploadBtn");
const runAutomlBtn = document.getElementById("runAutomlBtn");
const exportReportBtn = document.getElementById("exportReportBtn");
const appStatus = document.getElementById("appStatus");
const pipelineNotes = document.getElementById("pipelineNotes");
const datasetName = document.getElementById("datasetName");
const datasetStatus = document.getElementById("datasetStatus");

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

let previewColumns = [];
let previewRows = [];
let activeDatasetId = null;

function setStatus(message, isError = false) {
  appStatus.textContent = message;
  appStatus.className = `text-xs ${isError ? "text-red-500" : "text-slate-500"}`;
}

function setPipelineNotes(message, isWarning = false) {
  pipelineNotes.textContent = message;
  pipelineNotes.className = `text-xs mt-1 ${isWarning ? "text-amber-600" : "text-slate-500"}`;
}

function setDatasetState(uploaded) {
  if (uploaded) {
    datasetStatus.textContent = "UPLOADED";
    datasetStatus.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  } else {
    datasetStatus.textContent = "PENDING";
    datasetStatus.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  }

  exportReportBtn.disabled = !uploaded;
  exportReportBtn.classList.toggle("opacity-50", !uploaded);
  exportReportBtn.classList.toggle("cursor-not-allowed", !uploaded);
}

function setAutomlStateComplete() {
  datasetStatus.textContent = "PROCESSED";
  datasetStatus.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}

async function apiCall(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function renderPreview(columns, rows) {
  if (!columns.length) {
    previewTable.innerHTML = "";
    previewMeta.textContent = "Showing 0 entries";
    return;
  }

  const head = `
    <thead class="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
      <tr>${columns
        .map((col) => `<th class="px-6 py-3 border-b border-slate-200 dark:border-slate-800">${col}</th>`)
        .join("")}</tr>
    </thead>`;

  const bodyRows = rows
    .map((row) => `<tr>${columns
      .map((col) => `<td class="px-6 py-4 border-t border-slate-100 dark:border-slate-800">${row[col] ?? ""}</td>`)
      .join("")}</tr>`)
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
  if (topPair) {
    correlationPairs.textContent = `Top pair: ${topPair.feature_1} vs ${topPair.feature_2} (corr=${topPair.correlation})`;
  } else {
    correlationPairs.textContent = "No strong pair found.";
  }
}

function switchTab(tabName) {
  tabContents.forEach((section) => {
    const show = section.getAttribute("data-tab-content") === tabName;
    section.classList.toggle("hidden", !show);
  });

  tabLinks.forEach((link) => {
    const isActive = link.getAttribute("data-tab-link") === tabName;
    if (isActive) {
      link.classList.add("text-primary", "font-semibold", "bg-primary/10");
      link.classList.remove("text-slate-500", "dark:text-slate-400");
    } else {
      link.classList.remove("text-primary", "font-semibold", "bg-primary/10");
      link.classList.add("text-slate-500", "dark:text-slate-400");
    }
  });
}

function resetResultSections() {
  targetInfo.textContent = "Target: -";
  featureImportanceContainer.innerHTML = "<p class='text-sm text-slate-500 dark:text-slate-400'>Feature importance will appear after running AutoML.</p>";
  modelTableBody.innerHTML = '<tr><td class="px-6 py-4" colspan="6">No model results yet. Upload a dataset and run AutoML.</td></tr>';
  renderCorrelation(null);
  setPipelineNotes("Pipeline notes will appear here.");
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

  if (payload.summary_cache_hit) {
    setPipelineNotes("Summary loaded from cache for faster response.");
  }
}

async function handleUpload() {
  const file = datasetFileInput.files[0];
  if (!file) {
    setStatus("Please choose a CSV file first.", true);
    return;
  }

  setStatus("Uploading dataset...");
  uploadBtn.disabled = true;
  runAutomlBtn.disabled = true;
  resetResultSections();

  try {
    const formData = new FormData();
    formData.append("file", file);
    const payload = await apiCall("/upload", { method: "POST", body: formData });
    activeDatasetId = payload.dataset_id;

    setDatasetState(true);
    datasetName.textContent = payload.filename;
    setStatus(`Upload complete in ${payload.parse_time_ms} ms. Summary loaded. Click Run AutoML.`);
    await loadSummary();
  } catch (error) {
    setStatus(error.message, true);
    setDatasetState(false);
  } finally {
    uploadBtn.disabled = false;
    runAutomlBtn.disabled = false;
  }
}

async function runAutoml() {
  if (!activeDatasetId) {
    setStatus("Upload a dataset before running AutoML.", true);
    return;
  }

  setStatus("Running AutoML models. This may take a moment...");
  runAutomlBtn.disabled = true;
  runAutomlBtn.classList.add("opacity-60", "cursor-not-allowed");

  try {
    const payload = await apiCall(`/run-automl?dataset_id=${encodeURIComponent(activeDatasetId)}`, { method: "POST" });
    const results = payload.ml_results;

    targetInfo.textContent = `Target: ${results.target_column}`;
    columnSplit.textContent = `${results.numeric_feature_count} numerical | ${results.categorical_feature_count} categorical`;

    renderFeatureImportance(results.feature_importance || []);
    renderLeaderboard(results.model_scores || []);

    const noteParts = [];
    if ((results.dropped_feature_columns || []).length > 0) {
      noteParts.push(`Dropped high-cardinality columns: ${results.dropped_feature_columns.join(", ")}`);
    }
    if ((results.model_failures || []).length > 0) {
      noteParts.push(`Model warnings: ${results.model_failures.map((m) => m.model_name).join(", ")}`);
    }
    if (payload.automl_cache_hit) {
      noteParts.push("AutoML results returned from cache.");
    }
    if (noteParts.length > 0) {
      setPipelineNotes(noteParts.join(" | "), true);
    } else {
      setPipelineNotes("All models executed successfully.");
    }

    setAutomlStateComplete();
    setStatus(`AutoML complete for ${payload.filename} in ${results.execution_time_ms} ms.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    runAutomlBtn.disabled = false;
    runAutomlBtn.classList.remove("opacity-60", "cursor-not-allowed");
  }
}

async function exportReport() {
  if (!activeDatasetId) {
    setStatus("Upload a dataset before exporting report.", true);
    return;
  }

  try {
    setStatus("Preparing report export...");
    const response = await fetch(`/report?dataset_id=${encodeURIComponent(activeDatasetId)}`);
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "Failed to export report.");
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
    setStatus(error.message, true);
  }
}

datasetFileInput.addEventListener("change", () => {
  const file = datasetFileInput.files[0];
  if (!file) {
    return;
  }
  setStatus(`Selected ${file.name}. Click Upload CSV.`);
});
uploadBtn.addEventListener("click", handleUpload);
runAutomlBtn.addEventListener("click", runAutoml);
exportReportBtn.addEventListener("click", exportReport);
filterRowsInput.addEventListener("input", applyPreviewFilter);
tabLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab(link.getAttribute("data-tab-link"));
  });
});

setDatasetState(false);
switchTab("overview");
