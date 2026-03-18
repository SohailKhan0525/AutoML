import json
import logging
import pickle
import time
from asyncio import Lock
from time import perf_counter
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import Body, Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ml_pipeline import analyze_dataset, optimize_dataframe_memory, run_ml_pipeline
from models import User, get_db
from auth import hash_password, verify_password, create_access_token, verify_token


# Pydantic models for authentication
class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str

app = FastAPI(title="AutoML Dataset Analyzer", version="0.1.0")

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory storage for MVP workflow (single active dataset per app instance).
app.state.datasets = {}
app.state.dataset_order = []
app.state.latest_dataset_id = None
app.state.automl_lock = Lock()

MAX_DATASETS_IN_MEMORY = 6
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 200
DATASET_TTL_SECONDS = 60 * 60

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("automl")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error. Please retry or check server logs."},
    )


def _remove_dataset(dataset_id: str) -> None:
    if dataset_id in app.state.datasets:
        del app.state.datasets[dataset_id]
    if dataset_id in app.state.dataset_order:
        app.state.dataset_order.remove(dataset_id)
    if app.state.latest_dataset_id == dataset_id:
        app.state.latest_dataset_id = app.state.dataset_order[-1] if app.state.dataset_order else None


def _json_safe(value: Any) -> Any:
    """Recursively convert non-JSON-safe values (NaN/Inf/NumPy/Pandas scalars) to safe values."""
    if value is None or value is pd.NA:
        return None

    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]

    if isinstance(value, np.generic):
        value = value.item()

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, float):
        if np.isnan(value) or np.isinf(value):
            return None
        return value

    return value


def _cleanup_expired_datasets() -> None:
    now = time.time()
    expired_ids: list[str] = []
    for dataset_id in list(app.state.dataset_order):
        dataset = app.state.datasets.get(dataset_id)
        if not dataset:
            expired_ids.append(dataset_id)
            continue
        if now - dataset["created_at"] > DATASET_TTL_SECONDS:
            expired_ids.append(dataset_id)

    for dataset_id in expired_ids:
        logger.info("Expiring dataset %s", dataset_id)
        _remove_dataset(dataset_id)


def _get_dataset(dataset_id: str | None):
    _cleanup_expired_datasets()
    if dataset_id:
        dataset = app.state.datasets.get(dataset_id)
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found.")
        dataset["last_accessed_at"] = time.time()
        return dataset

    latest_id = app.state.latest_dataset_id
    if latest_id is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded yet.")

    dataset = app.state.datasets[latest_id]
    dataset["last_accessed_at"] = time.time()
    return dataset


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/landing")
async def landing_page(request: Request):
    """Serve landing page for global users."""
    return templates.TemplateResponse("landing.html", {"request": request})


@app.get("/signup")
async def signup_page(request: Request):
    """Serve signup page."""
    return templates.TemplateResponse("signup.html", {"request": request})


@app.get("/login")
async def login_page(request: Request):
    """Serve login page."""
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/dashboard")
async def dashboard_page(request: Request):
    """Serve dashboard page."""
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.post("/api/auth/signup")
async def signup(request: SignupRequest, db: Session = Depends(get_db)):
    """Sign up a new user."""
    email = request.email.strip()
    password = request.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required.")

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Create new user
    user_id = str(uuid4())
    hashed_pw = hash_password(password)
    user = User(id=user_id, email=email, hashed_password=hashed_pw)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate token
    token = create_access_token(user.id, user.email)
    logger.info("User signed up: %s", email)

    return {"message": "Signup successful.", "token": token, "user": user.to_dict()}


@app.post("/api/auth/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Log in a user."""
    email = request.email.strip()
    password = request.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required.")

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.id, user.email)
    logger.info("User logged in: %s", email)

    return {"message": "Login successful.", "token": token, "user": user.to_dict()}


@app.post("/api/auth/verify")
async def verify_auth(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """Verify JWT token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")

    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    token = parts[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return {"valid": True, "user": user.to_dict()}


@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Upload and validate CSV dataset with production-safe limits."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a valid CSV file.")

    try:
        if file.file is None:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="File too large. Max size is 50 MB.")

        start = perf_counter()
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

    if df.shape[0] > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Dataset has too many rows. Max allowed is {MAX_ROWS}.")

    if df.shape[1] > MAX_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Dataset has too many columns. Max allowed is {MAX_COLUMNS}.")

    dataset_id = str(uuid4())
    now = time.time()
    app.state.datasets[dataset_id] = {
        "id": dataset_id,
        "filename": file.filename,
        "df": df,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "created_at": now,
        "last_accessed_at": now,
        "summary": None,
        "automl_cache": {},
        "model_artifacts": {},
    }
    app.state.dataset_order.append(dataset_id)
    app.state.latest_dataset_id = dataset_id

    # Keep memory bounded for low-resource deployment.
    while len(app.state.dataset_order) > MAX_DATASETS_IN_MEMORY:
        oldest_id = app.state.dataset_order.pop(0)
        _remove_dataset(oldest_id)

    logger.info("Uploaded dataset %s (%s) rows=%s cols=%s", dataset_id, file.filename, df.shape[0], df.shape[1])

    return {
        "message": "Dataset uploaded successfully.",
        "filename": file.filename,
        "dataset_id": dataset_id,
        "parse_time_ms": parse_ms,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
    }


@app.get("/datasets")
async def list_datasets():
    """List active datasets retained in memory for the current app instance."""
    _cleanup_expired_datasets()
    now = time.time()
    return {
        "datasets": [
            {
                "dataset_id": dataset_id,
                "filename": app.state.datasets[dataset_id]["filename"],
                "rows": app.state.datasets[dataset_id]["rows"],
                "columns": app.state.datasets[dataset_id]["columns"],
                "created_at": app.state.datasets[dataset_id]["created_at"],
                "expires_in_seconds": max(
                    0,
                    int(DATASET_TTL_SECONDS - (now - app.state.datasets[dataset_id]["created_at"])),
                ),
                "trained_targets": list(app.state.datasets[dataset_id]["automl_cache"].keys()),
            }
            for dataset_id in reversed(app.state.dataset_order)
            if dataset_id in app.state.datasets
        ]
    }


@app.get("/summary")
async def dataset_summary(dataset_id: str | None = None, preview_rows: int = 5):
    """Return summary and preview rows with summary cache support."""
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
    preview_df = df.head(row_count).replace([np.inf, -np.inf], np.nan)
    preview = preview_df.where(pd.notna(preview_df), None).to_dict(orient="records")

    payload = {
        "dataset_id": dataset["id"],
        "filename": filename,
        "summary": summary,
        "preview_rows": preview,
        "summary_cache_hit": summary_cache_hit,
    }
    return _json_safe(payload)


@app.post("/run-automl")
async def run_automl(
    dataset_id: str | None = None,
    target_column: str | None = Query(default=None),
):
    """Train models for a dataset and selected target with per-target caching."""
    dataset = _get_dataset(dataset_id)
    df = dataset["df"]
    filename = dataset["filename"]
    selected_target = target_column or str(df.columns[-1])

    automl_cache_hit = selected_target in dataset["automl_cache"]
    if not automl_cache_hit:
        try:
            async with app.state.automl_lock:
                # Re-check inside lock in case another request already trained this target.
                if selected_target in dataset["automl_cache"]:
                    ml_results = dataset["automl_cache"][selected_target]
                    automl_cache_hit = True
                else:
                    start = perf_counter()
                    ml_results, best_model = run_ml_pipeline(
                        df,
                        target_column=selected_target,
                        return_best_model=True,
                    )
                    ml_results["execution_time_ms"] = round((perf_counter() - start) * 1000, 2)
                    dataset["automl_cache"][selected_target] = ml_results
                    dataset["model_artifacts"][selected_target] = {
                        "blob": pickle.dumps(best_model),
                        "trained_at": time.time(),
                        "feature_columns": [c for c in df.columns if c != selected_target],
                    }
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"ML pipeline failed: {exc}") from exc
    else:
        ml_results = dataset["automl_cache"][selected_target]

    payload = {
        "dataset_id": dataset["id"],
        "filename": filename,
        "ml_results": ml_results,
        "target_column": selected_target,
        "automl_cache_hit": automl_cache_hit,
    }
    return _json_safe(payload)


@app.get("/report")
async def export_report(dataset_id: str | None = None):
    """Download a JSON report combining summary and latest AutoML outputs."""
    dataset = _get_dataset(dataset_id)
    summary_payload = await dataset_summary(dataset_id=dataset["id"], preview_rows=10)
    target = list(dataset["automl_cache"].keys())[-1] if dataset["automl_cache"] else None
    automl_payload = await run_automl(dataset_id=dataset["id"], target_column=target)

    report = {
        "dataset_id": dataset["id"],
        "filename": dataset["filename"],
        "summary": summary_payload["summary"],
        "preview_rows": summary_payload["preview_rows"],
        "ml_results": automl_payload["ml_results"],
        "generated_at_ms": round(perf_counter() * 1000, 2),
    }
    content = json.dumps(_json_safe(report), allow_nan=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{dataset["filename"].rsplit(".", 1)[0]}_report.json"'
        },
    )


@app.get("/model/download")
async def download_model(dataset_id: str, target_column: str | None = None):
    """Download a trained model artifact as a pickle file."""
    dataset = _get_dataset(dataset_id)
    selected_target = target_column or (list(dataset["model_artifacts"].keys())[-1] if dataset["model_artifacts"] else None)
    if not selected_target:
        raise HTTPException(status_code=400, detail="No trained model available. Run AutoML first.")

    artifact = dataset["model_artifacts"].get(selected_target)
    if not artifact:
        raise HTTPException(status_code=404, detail="Trained model for selected target not found.")

    base_name = dataset["filename"].rsplit(".", 1)[0]
    return Response(
        content=artifact["blob"],
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{base_name}_{selected_target}.pkl"'},
    )


@app.post("/predict")
async def predict(
    dataset_id: str,
    target_column: str | None = None,
    records: list[dict[str, Any]] | dict[str, Any] = Body(...),
):
    """Run predictions with a previously trained model using JSON feature records."""
    dataset = _get_dataset(dataset_id)
    selected_target = target_column or (list(dataset["model_artifacts"].keys())[-1] if dataset["model_artifacts"] else None)
    if not selected_target:
        raise HTTPException(status_code=400, detail="No trained model available. Run AutoML first.")

    artifact = dataset["model_artifacts"].get(selected_target)
    if not artifact:
        raise HTTPException(status_code=404, detail="No model artifact found for selected target.")

    if isinstance(records, dict):
        records = [records]
    if not records:
        raise HTTPException(status_code=400, detail="Prediction payload is empty.")

    model = pickle.loads(artifact["blob"])
    input_df = pd.DataFrame(records)
    expected_columns = artifact["feature_columns"]
    for col in expected_columns:
        if col not in input_df.columns:
            input_df[col] = np.nan
    input_df = input_df[expected_columns]

    predictions = model.predict(input_df).tolist()
    payload = {
        "dataset_id": dataset_id,
        "target_column": selected_target,
        "count": len(predictions),
        "predictions": predictions,
    }
    return _json_safe(payload)


@app.delete("/dataset")
async def delete_dataset(dataset_id: str):
    """Delete a dataset from in-memory cache."""
    if dataset_id not in app.state.datasets:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    _remove_dataset(dataset_id)
    return {"message": "Dataset deleted successfully.", "dataset_id": dataset_id}


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
