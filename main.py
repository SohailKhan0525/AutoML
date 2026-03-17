import json
from time import perf_counter
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from ml_pipeline import analyze_dataset, optimize_dataframe_memory, run_ml_pipeline

app = FastAPI(title="AutoML Dataset Analyzer", version="0.1.0")

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory storage for MVP workflow (single active dataset per app instance).
app.state.datasets = {}
app.state.dataset_order = []
app.state.latest_dataset_id = None
MAX_DATASETS_IN_MEMORY = 2


def _get_dataset(dataset_id: str | None):
    if dataset_id:
        dataset = app.state.datasets.get(dataset_id)
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found.")
        return dataset

    latest_id = app.state.latest_dataset_id
    if latest_id is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded yet.")

    return app.state.datasets[latest_id]


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a valid CSV file.")

    try:
        if file.file is None:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        start = perf_counter()
        file.file.seek(0)
        df = pd.read_csv(file.file)
        parse_ms = round((perf_counter() - start) * 1000, 2)

        if df.empty:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        df = optimize_dataframe_memory(df)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {exc}") from exc

    if df.shape[1] < 2:
        raise HTTPException(
            status_code=400,
            detail="Dataset must contain at least one feature column and one target column.",
        )

    dataset_id = str(uuid4())
    app.state.datasets[dataset_id] = {
        "id": dataset_id,
        "filename": file.filename,
        "df": df,
        "summary": None,
        "preview_rows": None,
        "ml_results": None,
    }
    app.state.dataset_order.append(dataset_id)
    app.state.latest_dataset_id = dataset_id

    # Keep memory bounded for low-resource deployment.
    while len(app.state.dataset_order) > MAX_DATASETS_IN_MEMORY:
        oldest_id = app.state.dataset_order.pop(0)
        del app.state.datasets[oldest_id]

    return {
        "message": "Dataset uploaded successfully.",
        "filename": file.filename,
        "dataset_id": dataset_id,
        "parse_time_ms": parse_ms,
    }


@app.get("/datasets")
async def list_datasets():
    return {
        "datasets": [
            {
                "dataset_id": dataset_id,
                "filename": app.state.datasets[dataset_id]["filename"],
            }
            for dataset_id in reversed(app.state.dataset_order)
            if dataset_id in app.state.datasets
        ]
    }


@app.get("/summary")
async def dataset_summary(dataset_id: str | None = None, preview_rows: int = 5):
    dataset = _get_dataset(dataset_id)
    df = dataset["df"]
    filename = dataset["filename"]

    summary_cache_hit = dataset["summary"] is not None
    if dataset["summary"] is None:
        summary = analyze_dataset(df)
        dataset["summary"] = summary
    else:
        summary = dataset["summary"]

    row_count = max(1, min(preview_rows, 20))
    preview = df.head(row_count).replace({pd.NA: None, np.nan: None}).to_dict(orient="records")

    return {
        "dataset_id": dataset["id"],
        "filename": filename,
        "summary": summary,
        "preview_rows": preview,
        "summary_cache_hit": summary_cache_hit,
    }


@app.post("/run-automl")
async def run_automl(dataset_id: str | None = None):
    dataset = _get_dataset(dataset_id)
    df = dataset["df"]
    filename = dataset["filename"]

    automl_cache_hit = dataset["ml_results"] is not None
    if dataset["ml_results"] is None:
        try:
            start = perf_counter()
            ml_results = run_ml_pipeline(df)
            ml_results["execution_time_ms"] = round((perf_counter() - start) * 1000, 2)
            dataset["ml_results"] = ml_results
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"ML pipeline failed: {exc}") from exc
    else:
        ml_results = dataset["ml_results"]

    return {
        "dataset_id": dataset["id"],
        "filename": filename,
        "ml_results": ml_results,
        "automl_cache_hit": automl_cache_hit,
    }


@app.get("/report")
async def export_report(dataset_id: str | None = None):
    dataset = _get_dataset(dataset_id)
    summary_payload = await dataset_summary(dataset_id=dataset["id"], preview_rows=10)
    automl_payload = await run_automl(dataset_id=dataset["id"])

    report = {
        "dataset_id": dataset["id"],
        "filename": dataset["filename"],
        "summary": summary_payload["summary"],
        "preview_rows": summary_payload["preview_rows"],
        "ml_results": automl_payload["ml_results"],
        "generated_at_ms": round(perf_counter() * 1000, 2),
    }
    content = json.dumps(report)
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{dataset["filename"].rsplit(".", 1)[0]}_report.json"'
        },
    )


@app.post("/api/upload")
async def legacy_upload(file: UploadFile = File(...)):
    """Backward-compatible endpoint for older clients using the previous API shape."""
    upload_payload = await upload_dataset(file)
    dataset_id = upload_payload["dataset_id"]

    summary_payload = await dataset_summary(dataset_id=dataset_id)
    automl_payload = await run_automl(dataset_id=dataset_id)

    return {
        "dataset_id": dataset_id,
        "filename": upload_payload["filename"],
        "summary": summary_payload["summary"],
        "preview_rows": summary_payload["preview_rows"],
        "ml_results": automl_payload["ml_results"],
        "message": "Legacy endpoint is supported. Prefer /upload, /summary, and /run-automl.",
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
