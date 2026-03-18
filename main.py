import json
import logging
import pickle
import re
import time
from datetime import datetime
from asyncio import Lock
from time import perf_counter
from typing import Any
from uuid import uuid4
import os
from urllib.parse import urlencode
from urllib.request import Request as URLRequest, urlopen
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv

import numpy as np
import pandas as pd
import nbformat
from fastapi import Body, Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ml_pipeline import analyze_dataset, optimize_dataframe_memory, run_ml_pipeline
from models import User, SessionLocal, get_db
from auth import hash_password, verify_password, create_access_token, verify_token


# Pydantic models for authentication
class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserSettingsRequest(BaseModel):
    dark_mode: bool
    email_notifications: bool
    activity_log: bool
    two_factor: bool


class ActivityRequest(BaseModel):
    event: str
    details: str | None = None


class TwoFactorToggleRequest(BaseModel):
    enabled: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


load_dotenv()

app = FastAPI(title="AutoML Dataset Analyzer", version="0.1.0")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8000").split(",")
    if origin.strip()
]
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS or ["*"])

# Serve React static assets
react_dist_path = os.path.join(os.path.dirname(__file__), "static", "dist")
if os.path.exists(react_dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(react_dist_path, "assets")), name="assets")

app.state.datasets = {}
app.state.dataset_order = []
app.state.latest_dataset_id = None
app.state.automl_lock = Lock()
app.state.user_settings = {}
app.state.user_activity = {}
app.state.oauth_states = {}
app.state.rate_limits = {}

MAX_DATASETS_IN_MEMORY = 6
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
DATASET_TTL_SECONDS = 60 * 60
MAX_ROWS = int(os.getenv("MAX_ROWS", "120000"))
MAX_COLUMNS = int(os.getenv("MAX_COLUMNS", "300"))
MAX_EMAIL_LENGTH = 254
MAX_PASSWORD_LENGTH = 128
MAX_ACTIVITY_EVENTS_PER_USER = 200
OAUTH_STATE_TTL_SECONDS = 600
RATE_LIMIT_WINDOW_SECONDS = 60
AUTH_RATE_LIMIT_PER_WINDOW = int(os.getenv("AUTH_RATE_LIMIT_PER_WINDOW", "20"))
AUTOML_RATE_LIMIT_PER_WINDOW = int(os.getenv("AUTOML_RATE_LIMIT_PER_WINDOW", "12"))
SEED_TEST_USERS = os.getenv("SEED_TEST_USERS", "true").strip().lower() in {"1", "true", "yes", "y"}
TEST_PRO_USERS = os.getenv("TEST_PRO_USERS", "test@gmail.com:sohailkhan|test1@gmailcom:sohail@khan")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")

GITHUB_OAUTH_NAME = os.getenv("GITHUB_OAUTH_NAME", "AutoML GitHub Login")
GITHUB_OAUTH_DESCRIPTION = os.getenv(
    "GITHUB_OAUTH_DESCRIPTION",
    "Sign in to AutoML with GitHub for secure one-click access.",
)
GOOGLE_OAUTH_NAME = os.getenv("GOOGLE_OAUTH_NAME", "AutoML Google Login")

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

GITHUB_CALLBACK_URL = os.getenv("GITHUB_CALLBACK_URL", f"{BACKEND_URL}/api/auth/oauth/github/callback")
GOOGLE_CALLBACK_URL = os.getenv("GOOGLE_CALLBACK_URL", f"{BACKEND_URL}/api/auth/oauth/google/callback")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("automl")


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = str(uuid4())
    logger.exception("Unhandled server error request_id=%s path=%s", request_id, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "message": "Unexpected server error.",
                "code": "INTERNAL_SERVER_ERROR",
                "request_id": request_id,
                "path": request.url.path,
            }
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = str(uuid4())
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "request_id": request_id,
            "path": request.url.path,
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = str(uuid4())
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "message": "Request validation failed.",
                "code": "REQUEST_VALIDATION_ERROR",
                "errors": exc.errors(),
                "request_id": request_id,
                "path": request.url.path,
            }
        },
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


def _generate_automl_notebook(
    df: pd.DataFrame,
    filename: str,
    target_column: str,
    ml_results: dict[str, Any],
    summary: dict[str, Any],
) -> bytes:
    """Generate an AutoML notebook artifact with rich analysis and explanations."""
    plan = str(ml_results.get("pricing_plan", "free")).lower()
    task_type = str(ml_results.get("task_type", "unknown"))
    best_model_name = str(ml_results.get("best_model_name", "N/A"))
    model_scores = ml_results.get("model_scores", [])
    top_score = model_scores[0] if model_scores else {}
    second_score = model_scores[1] if len(model_scores) > 1 else None
    metric_name = str(top_score.get("metric_name", "N/A"))
    metric_value = top_score.get("score", "N/A")
    insights = ml_results.get("auto_insights", [])
    feature_importance = ml_results.get("feature_importance", [])
    dropped_features = ml_results.get("dropped_feature_columns", [])
    leakage_features = ml_results.get("leakage_feature_columns", [])
    duplicate_features = ml_results.get("duplicate_feature_columns", [])
    cv_results = ml_results.get("cross_validation", [])
    tuning_summary = ml_results.get("hyperparameter_tuning", {})
    trained_rows = ml_results.get("trained_rows", len(df))
    workflow_mode = ml_results.get("workflow_mode", "Fast Mode")
    workflow_strategy = ml_results.get("workflow_strategy", {})

    preview_df = df.head(10).replace([np.inf, -np.inf], np.nan)
    preview_records = preview_df.where(pd.notna(preview_df), None).to_dict(orient="records")

    score_gap = None
    if second_score and isinstance(top_score.get("score"), (int, float)) and isinstance(second_score.get("score"), (int, float)):
        score_gap = round(float(top_score["score"]) - float(second_score["score"]), 4)

    top_feature_names: list[str] = []
    for row in feature_importance[:10]:
        raw_name = str(row.get("feature", "")).strip()
        cleaned = re.sub(r"^(num__|cat__)", "", raw_name).replace("onehot__", "")
        if cleaned:
            top_feature_names.append(cleaned)

    rating_related = [f for f in top_feature_names if re.search(r"rating|elo|score|strength", f, flags=re.IGNORECASE)]
    turns_related = [f for f in top_feature_names if re.search(r"turn|move|ply|duration|time", f, flags=re.IGNORECASE)]

    model_win_lines = [
        f"- Winning model: **{best_model_name}**",
        f"- Primary metric: **{metric_name} = {metric_value}**",
    ]
    if second_score:
        model_win_lines.append(f"- Runner-up: **{second_score.get('model_name', 'N/A')}** with **{second_score.get('score', 'N/A')}**")
    if score_gap is not None:
        if score_gap >= 0.02:
            model_win_lines.append(f"- Performance gap is **{score_gap}**, indicating a strong lead.")
        elif score_gap >= 0.005:
            model_win_lines.append(f"- Performance gap is **{score_gap}**, indicating a moderate lead.")
        else:
            model_win_lines.append(f"- Performance gap is **{score_gap}**, so top models are close.")

    feature_reason_lines: list[str] = []
    if rating_related:
        feature_reason_lines.append("- **Why ratings matter:** " + ", ".join(rating_related[:5]) + " capture relative strength and are often highly predictive.")
    else:
        feature_reason_lines.append("- **Why ratings matter:** rating-like columns usually encode baseline skill/quality differences.")
    if turns_related:
        feature_reason_lines.append("- **Why turns matter:** " + ", ".join(turns_related[:5]) + " can encode pace/complexity and affect outcomes.")
    else:
        feature_reason_lines.append("- **Why turns matter:** move-count and time style features often separate close outcomes.")
    if top_feature_names:
        feature_reason_lines.append("- **Top feature set in this run:** " + ", ".join(top_feature_names[:8]) + ".")

    leakage_lines: list[str] = [
        f"- Plan at training time: **{plan}** ({workflow_mode}).",
        "- The pipeline removes potential target leakage features before training.",
        "- Checks include direct target copies, one-to-one mappings, and near-perfect numeric correlations.",
    ]
    leakage_lines.append(
        "- Leakage features removed in this run: **" + ", ".join([str(v) for v in leakage_features[:15]]) + "**"
        if leakage_features
        else "- No strong leakage features were detected in this run."
    )
    if dropped_features:
        leakage_lines.append("- Additional dropped features (high-cardinality/noise): **" + ", ".join([str(v) for v in dropped_features[:15]]) + "**")
    if duplicate_features:
        leakage_lines.append("- Duplicate features removed (Pro): **" + ", ".join([str(v) for v in duplicate_features[:15]]) + "**")

    cv_lines: list[str] = []
    if cv_results:
        for row in cv_results[:5]:
            cv_lines.append(f"- {row.get('model_name', 'N/A')}: mean={row.get('mean_score', 'N/A')} std={row.get('std_score', 'N/A')} over {row.get('folds', 'N/A')} folds")
    else:
        cv_lines.append("- Cross-validation was skipped in this run (plan/runtime optimization).")

    tuning_lines: list[str] = []
    tuning_enabled = bool(tuning_summary.get("enabled"))
    tuning_lines.append(f"- Hyperparameter tuning enabled: **{tuning_enabled}**")
    if tuning_enabled:
        tuning_lines.append(f"- Tuning method: **{tuning_summary.get('method', 'N/A')}**")
        tuning_lines.append(f"- Best tuning score: **{tuning_summary.get('best_score', 'N/A')}**")
        best_params = tuning_summary.get("best_params") or {}
        if best_params:
            tuning_lines.append("- Best parameters: **" + json.dumps(best_params, ensure_ascii=True) + "**")
    else:
        tuning_lines.append("- Tuning skipped to keep synchronous runtime reliable.")

    nb = nbformat.v4.new_notebook()
    nb.cells = [
        nbformat.v4.new_markdown_cell("\n".join([
            "# AutoML Pro Analysis Notebook",
            "",
            f"Generated from dataset: **{filename}**",
            f"Target column: **{target_column}**",
            f"Task type: **{task_type}**",
            f"Workflow mode: **{workflow_mode}**",
            f"Best model: **{best_model_name}**",
            f"Top metric: **{metric_name} = {metric_value}**",
            f"Trained rows used: **{trained_rows}**",
            f"Generated at: **{datetime.utcnow().isoformat()}Z**",
        ])),
        nbformat.v4.new_markdown_cell("\n".join(["## Why This Model Wins", "", *model_win_lines])),
        nbformat.v4.new_markdown_cell("\n".join(["## Leakage Policy and Data Safety (Pro)", "", *leakage_lines])),
        nbformat.v4.new_markdown_cell("## 1. Reproducible Setup"),
        nbformat.v4.new_code_cell("\n".join([
            "import pandas as pd",
            "import numpy as np",
            "from sklearn.model_selection import train_test_split",
            "from sklearn.compose import ColumnTransformer",
            "from sklearn.pipeline import Pipeline",
            "from sklearn.preprocessing import OneHotEncoder, StandardScaler",
            "from sklearn.impute import SimpleImputer",
            "from sklearn.linear_model import LogisticRegression, LinearRegression",
            "from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor",
            "from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor",
            "from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, r2_score, mean_absolute_error, mean_squared_error",
            f"DATA_FILE = '{filename}'",
            f"TARGET = '{target_column}'",
            f"TASK_TYPE = '{task_type}'",
            "RANDOM_STATE = 42",
        ])),
        nbformat.v4.new_markdown_cell("## 2. Load and Validate Data"),
        nbformat.v4.new_code_cell("\n".join([
            "df = pd.read_csv(DATA_FILE)",
            "print('Shape:', df.shape)",
            "print('Target exists:', TARGET in df.columns)",
            "df.head(10)",
        ])),
        nbformat.v4.new_markdown_cell("## 3. Data Profiling and EDA"),
        nbformat.v4.new_code_cell("\n".join([
            "df = df.replace([np.inf, -np.inf], np.nan)",
            "missing = df.isna().sum().sort_values(ascending=False)",
            "display(missing[missing > 0].head(20))",
            "numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()",
            "if len(numeric_cols) >= 2:",
            "    corr = df[numeric_cols].corr(numeric_only=True)",
            "    display(corr.head(15))",
            "df.describe(include='all').transpose().head(30)",
        ])),
        nbformat.v4.new_markdown_cell("## 4. Leakage Detection Checklist"),
        nbformat.v4.new_code_cell("\n".join([
            "X = df.drop(columns=[TARGET]).copy()",
            "y = df[TARGET].copy()",
            "potential_exact_leakage = []",
            "for col in X.columns:",
            "    try:",
            "        if X[col].astype(str).str.lower().equals(y.astype(str).str.lower()):",
            "            potential_exact_leakage.append(col)",
            "    except Exception:",
            "        pass",
            "print('Potential exact-leakage columns:', potential_exact_leakage)",
            f"pipeline_reported_leakage = {json.dumps(_json_safe(leakage_features), ensure_ascii=True)}",
            f"pipeline_dropped_features = {json.dumps(_json_safe(dropped_features), ensure_ascii=True)}",
            "print('Pipeline leakage removals:', pipeline_reported_leakage)",
            "print('Pipeline other dropped features:', pipeline_dropped_features)",
        ])),
        nbformat.v4.new_markdown_cell("## 5. Feature Engineering Rationale\n\n" + "\n".join(feature_reason_lines)),
        nbformat.v4.new_markdown_cell("## 6. Validation Stability (Cross-Validation)\n\n" + "\n".join(cv_lines)),
        nbformat.v4.new_markdown_cell("## 7. Hyperparameter Tuning Summary\n\n" + "\n".join(tuning_lines)),
        nbformat.v4.new_markdown_cell("## 7.1 Workflow Strategy (What / How / Why)\n\n```json\n" + json.dumps(_json_safe(workflow_strategy), indent=2, ensure_ascii=True) + "\n```"),
        nbformat.v4.new_markdown_cell("## 8. Server AutoML Snapshot"),
        nbformat.v4.new_code_cell("\n".join([
            f"preview_rows = {json.dumps(_json_safe(preview_records), ensure_ascii=True)}",
            f"model_scores = {json.dumps(_json_safe(model_scores), ensure_ascii=True)}",
            f"auto_insights = {json.dumps(_json_safe(insights), ensure_ascii=True)}",
            f"summary_snapshot = {json.dumps(_json_safe(summary), ensure_ascii=True)}",
            "print('Preview rows:', len(preview_rows))",
            "for row in model_scores[:10]:",
            "    print('-', row)",
            "for note in auto_insights:",
            "    print('-', note)",
        ])),
        nbformat.v4.new_markdown_cell("## 9. Practical Next Steps\n\n- Validate on a holdout set.\n- Monitor drift for ratings and turn-like features.\n- Re-check leakage when adding new columns."),
    ]

    notebook_json = nbformat.writes(nb, version=4)
    return notebook_json.encode("utf-8")


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


def _build_report_strategy_explanation(
    summary: dict[str, Any],
    ml_results: dict[str, Any],
) -> dict[str, Any]:
    """Build plain-language report explanation for what/how/why strategy."""
    best_model = ml_results.get("best_model_name", "N/A")
    task_type = ml_results.get("task_type", "unknown")
    plan = str(ml_results.get("pricing_plan", "free")).lower()
    workflow_mode = ml_results.get("workflow_mode", "Fast Mode")

    feature_importance = ml_results.get("feature_importance", []) or []
    top_features = [str(item.get("feature")) for item in feature_importance[:5] if item.get("feature")]

    leakage = ml_results.get("leakage_feature_columns", []) or []
    duplicates = ml_results.get("duplicate_feature_columns", []) or []
    dropped = ml_results.get("dropped_feature_columns", []) or []

    cv_rows = ml_results.get("cross_validation", []) or []
    cv_note = "Cross-validation skipped for this run."
    if cv_rows:
        best_cv = max(cv_rows, key=lambda row: float(row.get("mean_score", 0.0)))
        cv_note = (
            f"Cross-validation used {best_cv.get('folds', 0)} folds; "
            f"best mean {best_cv.get('metric_name', 'metric')} score came from {best_cv.get('model_name', 'N/A')} "
            f"at {best_cv.get('mean_score', 'N/A')}."
        )

    tuning = ml_results.get("hyperparameter_tuning", {}) or {}
    if tuning.get("enabled"):
        tuning_note = (
            f"Hyperparameter tuning ran with {tuning.get('method', 'randomized_search')} "
            f"and selected score {tuning.get('best_score', 'N/A')}."
        )
    else:
        tuning_note = "Hyperparameter tuning was disabled/skipped to keep runtime stable for this request."

    correlation_pairs = ((summary or {}).get("correlation") or {}).get("top_pairs") or []
    strongest_corr = correlation_pairs[0] if correlation_pairs else None
    corr_note = "No numeric correlation pairs were available."
    if strongest_corr:
        corr_note = (
            f"Strongest numeric pair: {strongest_corr.get('feature_1')} vs {strongest_corr.get('feature_2')} "
            f"with correlation {strongest_corr.get('correlation')}."
        )

    why_points = [
        f"The selected best model was {best_model} for {task_type} based on holdout ranking.",
        f"Plan-aware workflow mode ({workflow_mode}) balanced quality and runtime under the {plan.upper()} plan.",
        corr_note,
        cv_note,
        tuning_note,
    ]
    if top_features:
        why_points.append("Top predictive features were: " + ", ".join(top_features) + ".")
    if leakage:
        why_points.append("Leakage control removed: " + ", ".join([str(v) for v in leakage[:8]]) + ".")
    if duplicates:
        why_points.append("Duplicate feature control (Pro) removed: " + ", ".join([str(v) for v in duplicates[:8]]) + ".")

    return {
        "what": {
            "objective": "Train and rank baseline ML models, then expose explainable diagnostics and inference-ready artifacts.",
            "task_type": task_type,
            "best_model": best_model,
        },
        "how": {
            "workflow_mode": workflow_mode,
            "plan": plan,
            "rows": summary.get("rows"),
            "columns": summary.get("columns"),
            "top_features": top_features,
            "feature_controls": {
                "leakage_removed": leakage,
                "duplicate_removed": duplicates,
                "all_dropped": dropped,
            },
        },
        "why": why_points,
        "recommendations": [
            "Validate on a true holdout or recent-slice dataset before production rollout.",
            "Monitor top features for drift and data-quality shifts.",
            "Re-run training when schema, business process, or class balance changes materially.",
        ],
    }


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


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_valid_email(email: str) -> bool:
    if len(email) > MAX_EMAIL_LENGTH:
        return False
    return re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) is not None


def _validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail="Password is too long.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must contain an uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must contain a lowercase letter.")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must contain a number.")


def _build_auth_response(user: User, message: str) -> dict[str, Any]:
    token = create_access_token(user.id, user.email)
    return {"message": message, "token": token, "user": user.to_dict()}


def _oauth_http_json(
    url: str,
    method: str = "GET",
    form_data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    payload = None
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)

    if form_data is not None:
        payload = urlencode(form_data).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

    req = URLRequest(url=url, data=payload, headers=request_headers, method=method)
    try:
        with urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8") if exc.fp else ""
        raise HTTPException(status_code=400, detail=f"OAuth provider error: {body or exc.reason}") from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"OAuth network error: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="OAuth provider returned non-JSON response.") from exc


def _cleanup_oauth_states() -> None:
    now = time.time()
    expired = [s for s, v in app.state.oauth_states.items() if now - v.get("created_at", 0) > OAUTH_STATE_TTL_SECONDS]
    for state in expired:
        app.state.oauth_states.pop(state, None)


def _create_oauth_state(provider: str) -> str:
    _cleanup_oauth_states()
    state = uuid4().hex
    app.state.oauth_states[state] = {
        "provider": provider,
        "created_at": time.time(),
    }
    return state


def _consume_oauth_state(provider: str, state: str | None) -> None:
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state.")
    _cleanup_oauth_states()
    payload = app.state.oauth_states.pop(state, None)
    if not payload or payload.get("provider") != provider:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")


def _github_authorization_url(state: str) -> str:
    query = urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": GITHUB_CALLBACK_URL,
            "scope": "read:user user:email",
            "state": state,
        }
    )
    return f"https://github.com/login/oauth/authorize?{query}"


def _google_authorization_url(state: str) -> str:
    query = urlencode(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": GOOGLE_CALLBACK_URL,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
            "state": state,
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"


def _oauth_error_redirect(message: str) -> Response:
    encoded = urlencode({"error": message})
    return Response(
        status_code=302,
        headers={"Location": f"{FRONTEND_URL}/oauth/callback?{encoded}"},
    )


def _oauth_success_redirect(token: str) -> Response:
    encoded = urlencode({"token": token})
    return Response(
        status_code=302,
        headers={"Location": f"{FRONTEND_URL}/oauth/callback#{encoded}"},
    )


def _upsert_oauth_user(
    db: Session,
    provider: str,
    subject: str,
    email: str,
    display_name: str | None,
    avatar_url: str | None,
) -> User:
    if not email:
        raise HTTPException(status_code=400, detail="OAuth account does not expose an email address.")

    normalized_email = _normalize_email(email)
    user = db.query(User).filter(User.email == normalized_email).first()
    if user is None:
        user = User(
            id=str(uuid4()),
            email=normalized_email,
            hashed_password=hash_password(uuid4().hex),
            auth_provider=provider,
            auth_subject=subject,
            display_name=display_name or normalized_email.split("@")[0],
            avatar_url=avatar_url,
            plan="free",
        )
        db.add(user)
    else:
        user.auth_provider = provider
        user.auth_subject = subject
        if display_name:
            user.display_name = display_name
        if avatar_url:
            user.avatar_url = avatar_url
        if not user.plan:
            user.plan = "free"

    db.commit()
    db.refresh(user)
    return user


def _require_oauth_config(provider: str) -> None:
    if provider == "github":
        if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
            raise HTTPException(status_code=500, detail="GitHub OAuth is not configured.")
        return
    if provider == "google":
        if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
            raise HTTPException(status_code=500, detail="Google OAuth is not configured.")
        return
    raise HTTPException(status_code=400, detail="Unsupported OAuth provider.")


def _authenticate_user(email: str, password: str, db: Session) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return user


def _resolve_user_from_auth_header(authorization: str | None, db: Session) -> User:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")

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

    return user


def _default_user_settings() -> dict[str, bool]:
    return {
        "dark_mode": False,
        "email_notifications": True,
        "activity_log": True,
        "two_factor": False,
    }


def _normalize_pricing_plan(plan: str | None) -> str:
    normalized = str(plan or "free").strip().lower()
    if normalized not in {"free", "pro"}:
        return "free"
    return normalized


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _enforce_rate_limit(scope: str, identifier: str, limit: int, window_seconds: int = RATE_LIMIT_WINDOW_SECONDS) -> None:
    now = time.time()
    key = f"{scope}:{identifier}"
    entries = app.state.rate_limits.get(key, [])
    entries = [ts for ts in entries if now - ts <= window_seconds]
    if len(entries) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please retry in a minute.")
    entries.append(now)
    app.state.rate_limits[key] = entries


def _resolve_effective_plan(authorization: str | None, db: Session) -> str:
    if not authorization:
        return "free"
    user = _resolve_user_from_auth_header(authorization, db)
    return _normalize_pricing_plan(user.plan)


def _seed_test_users() -> None:
    if not SEED_TEST_USERS:
        return

    pairs = [entry.strip() for entry in TEST_PRO_USERS.split("|") if entry.strip()]
    if not pairs:
        return

    db = SessionLocal()
    try:
        for pair in pairs:
            if ":" not in pair:
                continue
            email_raw, password = pair.split(":", 1)
            email = _normalize_email(email_raw)
            if not email or not password:
                continue

            user = db.query(User).filter(User.email == email).first()
            if user is None:
                user = User(
                    id=str(uuid4()),
                    email=email,
                    hashed_password=hash_password(password),
                    display_name=email.split("@")[0],
                    plan="pro",
                )
                db.add(user)
                logger.info("Seeded test pro user: %s", email)
            else:
                user.hashed_password = hash_password(password)
                user.plan = "pro"
                db.add(user)
                logger.info("Updated test pro user credentials: %s", email)

        db.commit()
    finally:
        db.close()


@app.on_event("startup")
async def startup_tasks() -> None:
    _seed_test_users()


def _append_user_activity(user_id: str, event: str, details: str | None = None, force: bool = False) -> None:
    if not force:
        settings = app.state.user_settings.get(user_id, _default_user_settings())
        if not settings.get("activity_log", True):
            return

    entries = app.state.user_activity.setdefault(user_id, [])
    entries.insert(
        0,
        {
            "event": event,
            "details": details,
            "timestamp": time.time(),
        },
    )
    if len(entries) > MAX_ACTIVITY_EVENTS_PER_USER:
        del entries[MAX_ACTIVITY_EVENTS_PER_USER:]


@app.post("/api/auth/signup")
async def signup(request: SignupRequest, http_request: Request, db: Session = Depends(get_db)):
    """Sign up a new user."""
    _enforce_rate_limit("auth-signup", _client_ip(http_request), AUTH_RATE_LIMIT_PER_WINDOW)

    email = _normalize_email(request.email)
    password = request.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required.")

    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")

    _validate_password_strength(password)

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Create new user
    user_id = str(uuid4())
    hashed_pw = hash_password(password)
    user = User(id=user_id, email=email, hashed_password=hashed_pw, plan="free")
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("User signed up: %s", email)
    _append_user_activity(user.id, "account_created", "New account registered")

    return _build_auth_response(user, "Signup successful.")


@app.post("/api/auth/login")
async def login(request: LoginRequest, http_request: Request, db: Session = Depends(get_db)):
    """Log in a user."""
    _enforce_rate_limit("auth-login", _client_ip(http_request), AUTH_RATE_LIMIT_PER_WINDOW)

    email = _normalize_email(request.email)
    password = request.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required.")

    user = _authenticate_user(email, password, db)
    logger.info("User logged in: %s", email)
    _append_user_activity(user.id, "login", "User logged in")

    return _build_auth_response(user, "Login successful.")


@app.post("/api/auth/signin")
async def signin(request: LoginRequest, http_request: Request, db: Session = Depends(get_db)):
    """Sign in a user (alias for login)."""
    _enforce_rate_limit("auth-signin", _client_ip(http_request), AUTH_RATE_LIMIT_PER_WINDOW)

    email = _normalize_email(request.email)
    password = request.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required.")

    user = _authenticate_user(email, password, db)
    logger.info("User signed in: %s", email)
    _append_user_activity(user.id, "signin", "User signed in")

    return _build_auth_response(user, "Sign in successful.")


@app.get("/api/auth/oauth/config")
async def oauth_config_info():
    """Expose OAuth setup metadata for UI/help pages."""
    return {
        "github": {
            "name": GITHUB_OAUTH_NAME,
            "description": GITHUB_OAUTH_DESCRIPTION,
            "homepage_url": FRONTEND_URL,
            "authorization_callback_url": GITHUB_CALLBACK_URL,
        },
        "google": {
            "name": GOOGLE_OAUTH_NAME,
            "authorized_javascript_origins": [FRONTEND_URL],
            "authorized_redirect_uris": [GOOGLE_CALLBACK_URL],
        },
    }


@app.get("/api/auth/oauth/{provider}/start")
async def oauth_start(provider: str, request: Request):
    """Return provider authorization URL used by frontend login/signup buttons."""
    _enforce_rate_limit("auth-oauth-start", _client_ip(request), AUTH_RATE_LIMIT_PER_WINDOW)
    normalized = provider.strip().lower()
    _require_oauth_config(normalized)
    state = _create_oauth_state(normalized)

    if normalized == "github":
        auth_url = _github_authorization_url(state)
    elif normalized == "google":
        auth_url = _google_authorization_url(state)
    else:
        raise HTTPException(status_code=400, detail="Unsupported OAuth provider.")

    return {
        "provider": normalized,
        "authorization_url": auth_url,
        "name": GITHUB_OAUTH_NAME if normalized == "github" else GOOGLE_OAUTH_NAME,
        "description": GITHUB_OAUTH_DESCRIPTION if normalized == "github" else "Sign in with Google.",
    }


@app.get("/api/auth/oauth/github/callback")
async def oauth_github_callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    """GitHub OAuth callback: exchange code, create/login user, redirect to frontend."""
    try:
        _require_oauth_config("github")
        _consume_oauth_state("github", state)
        if not code:
            return _oauth_error_redirect("Missing GitHub authorization code.")

        token_data = _oauth_http_json(
            "https://github.com/login/oauth/access_token",
            method="POST",
            form_data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_CALLBACK_URL,
            },
            headers={"Accept": "application/json"},
        )
        access_token = token_data.get("access_token")
        if not access_token:
            error_code = str(token_data.get("error") or "unknown_error")
            error_description = str(token_data.get("error_description") or "No description provided.")
            logger.warning(
                "GitHub token exchange failed: %s - %s",
                error_code,
                error_description,
            )
            return _oauth_error_redirect(f"GitHub token exchange failed: {error_code} ({error_description})")

        user_data = _oauth_http_json(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "User-Agent": "automl-oauth"},
        )
        emails_data = _oauth_http_json(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}", "User-Agent": "automl-oauth"},
        )

        primary_email = None
        if isinstance(emails_data, list):
            for item in emails_data:
                if item.get("primary") and item.get("verified") and item.get("email"):
                    primary_email = item["email"]
                    break
            if primary_email is None and emails_data:
                primary_email = emails_data[0].get("email")

        email = primary_email or user_data.get("email")
        subject = str(user_data.get("id") or "")
        if not subject:
            return _oauth_error_redirect("GitHub user id is missing.")

        user = _upsert_oauth_user(
            db=db,
            provider="github",
            subject=subject,
            email=email,
            display_name=user_data.get("name") or user_data.get("login"),
            avatar_url=user_data.get("avatar_url"),
        )
        _append_user_activity(user.id, "oauth_github_login", "Signed in with GitHub")
        token = create_access_token(user.id, user.email)
        return _oauth_success_redirect(token)
    except HTTPException as exc:
        return _oauth_error_redirect(str(exc.detail))
    except Exception:
        return _oauth_error_redirect("GitHub OAuth sign-in failed. Please retry.")


@app.get("/api/auth/oauth/google/callback")
async def oauth_google_callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    """Google OAuth callback: exchange code, create/login user, redirect to frontend."""
    try:
        _require_oauth_config("google")
        _consume_oauth_state("google", state)
        if not code:
            return _oauth_error_redirect("Missing Google authorization code.")

        token_data = _oauth_http_json(
            "https://oauth2.googleapis.com/token",
            method="POST",
            form_data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GOOGLE_CALLBACK_URL,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        access_token = token_data.get("access_token")
        if not access_token:
            return _oauth_error_redirect("Google did not return an access token.")

        user_data = _oauth_http_json(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        email = user_data.get("email")
        subject = str(user_data.get("id") or "")
        if not subject:
            return _oauth_error_redirect("Google user id is missing.")

        user = _upsert_oauth_user(
            db=db,
            provider="google",
            subject=subject,
            email=email,
            display_name=user_data.get("name"),
            avatar_url=user_data.get("picture"),
        )
        _append_user_activity(user.id, "oauth_google_login", "Signed in with Google")
        token = create_access_token(user.id, user.email)
        return _oauth_success_redirect(token)
    except HTTPException as exc:
        return _oauth_error_redirect(str(exc.detail))
    except Exception:
        return _oauth_error_redirect("Google OAuth sign-in failed. Please retry.")


@app.post("/api/auth/verify")
async def verify_auth(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """Verify JWT token."""
    user = _resolve_user_from_auth_header(authorization, db)

    return {"valid": True, "user": user.to_dict()}


@app.post("/api/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Change the authenticated user's password."""
    user = _resolve_user_from_auth_header(authorization, db)

    if not request.current_password or not request.new_password:
        raise HTTPException(status_code=400, detail="Current and new password are required.")

    if request.current_password == request.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password.")

    if not verify_password(request.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    _validate_password_strength(request.new_password)

    user.hashed_password = hash_password(request.new_password)
    db.add(user)
    db.commit()

    logger.info("Password changed for user: %s", user.email)
    _append_user_activity(user.id, "password_changed", "Password updated successfully")
    return {"message": "Password updated successfully."}


@app.get("/api/user/settings")
async def get_user_settings(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """Fetch current user's persisted settings."""
    user = _resolve_user_from_auth_header(authorization, db)
    if user.id not in app.state.user_settings:
        app.state.user_settings[user.id] = _default_user_settings()

    return {"settings": app.state.user_settings[user.id]}


@app.put("/api/user/settings")
async def update_user_settings(
    request: UserSettingsRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Update current user's settings."""
    user = _resolve_user_from_auth_header(authorization, db)
    previous_settings = app.state.user_settings.get(user.id, _default_user_settings())
    updated_settings = {
        "dark_mode": request.dark_mode,
        "email_notifications": request.email_notifications,
        "activity_log": request.activity_log,
        "two_factor": request.two_factor,
    }
    app.state.user_settings[user.id] = updated_settings

    changed_details: list[str] = []
    if previous_settings.get("dark_mode") != updated_settings["dark_mode"]:
        changed_details.append(
            "Dark mode turned on" if updated_settings["dark_mode"] else "Dark mode turned off"
        )
    if previous_settings.get("email_notifications") != updated_settings["email_notifications"]:
        changed_details.append(
            "Email notifications turned on"
            if updated_settings["email_notifications"]
            else "Email notifications turned off"
        )
    if previous_settings.get("activity_log") != updated_settings["activity_log"]:
        changed_details.append(
            "Activity logging turned on"
            if updated_settings["activity_log"]
            else "Activity logging turned off"
        )
    if previous_settings.get("two_factor") != updated_settings["two_factor"]:
        changed_details.append(
            "Two-factor authentication turned on"
            if updated_settings["two_factor"]
            else "Two-factor authentication turned off"
        )

    if changed_details:
        _append_user_activity(
            user.id,
            "settings_updated",
            "; ".join(changed_details),
            force=True,
        )

    return {
        "message": "Settings updated.",
        "settings": app.state.user_settings[user.id],
        "changes": changed_details,
    }


@app.get("/api/user/activity")
async def get_user_activity(
    limit: int = Query(default=20, ge=1, le=100),
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Return recent activity entries for current user."""
    user = _resolve_user_from_auth_header(authorization, db)
    entries = app.state.user_activity.get(user.id, [])
    return {"activity": entries[:limit]}


@app.post("/api/user/activity")
async def add_user_activity(
    request: ActivityRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Append a user activity event from frontend interactions."""
    user = _resolve_user_from_auth_header(authorization, db)
    event = request.event.strip()
    if not event:
        raise HTTPException(status_code=400, detail="Event is required.")
    _append_user_activity(user.id, event, request.details)
    return {"message": "Activity recorded."}


@app.post("/api/user/2fa/toggle")
async def toggle_two_factor(
    request: TwoFactorToggleRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Enable or disable two-factor auth flag for the current user."""
    user = _resolve_user_from_auth_header(authorization, db)
    current_settings = app.state.user_settings.get(user.id, _default_user_settings())
    current_settings["two_factor"] = bool(request.enabled)
    app.state.user_settings[user.id] = current_settings

    event_name = "two_factor_enabled" if request.enabled else "two_factor_disabled"
    details = "Two-factor authentication enabled" if request.enabled else "Two-factor authentication disabled"
    _append_user_activity(user.id, event_name, details)

    return {
        "message": "Two-factor updated successfully.",
        "two_factor": current_settings["two_factor"],
    }


@app.get("/api/health")
async def health_check():
    """Lightweight runtime health endpoint for uptime checks."""
    return {
        "status": "ok",
        "service": "automl-api",
        "datasets_in_memory": len(app.state.datasets),
    }


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
        "notebook_artifacts": {},
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
    request: Request,
    dataset_id: str | None = Query(default=None),
    target_column: str | None = Query(default=None),
    payload: dict[str, Any] | None = Body(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Train models for a dataset and selected target with per-target caching."""
    payload = payload or {}
    resolved_dataset_id = dataset_id or payload.get("dataset_id")
    resolved_target_column = target_column or payload.get("target_column")

    dataset = _get_dataset(resolved_dataset_id)
    df = dataset["df"]
    filename = dataset["filename"]
    selected_target = resolved_target_column or str(df.columns[-1])
    _enforce_rate_limit("run-automl", _client_ip(request), AUTOML_RATE_LIMIT_PER_WINDOW)

    # Security: enforce plan from authenticated user instead of trusting request headers.
    pricing_plan = _resolve_effective_plan(authorization, db)

    cached_entry = dataset["automl_cache"].get(selected_target)
    automl_cache_hit = bool(cached_entry and cached_entry.get("plan") == pricing_plan)
    
    if not automl_cache_hit:
        try:
            async with app.state.automl_lock:
                # Re-check inside lock in case another request already trained this target.
                refreshed_cache_entry = dataset["automl_cache"].get(selected_target)
                if refreshed_cache_entry and refreshed_cache_entry.get("plan") == pricing_plan:
                    ml_results = refreshed_cache_entry["results"]
                    automl_cache_hit = True
                    # Rebuild missing model artifact for cache hit so prediction remains available.
                    if selected_target not in dataset["model_artifacts"]:
                        _, best_model = run_ml_pipeline(
                            df,
                            target_column=selected_target,
                            pricing_plan=pricing_plan,
                            return_best_model=True,
                        )
                        trained_features = ml_results.get("feature_metadata", {}).get("all_features", [])
                        trained_numeric = ml_results.get("feature_metadata", {}).get("numeric_features", [])
                        numeric_limits: dict[str, dict[str, float]] = {}
                        for col in trained_numeric:
                            col_series = pd.to_numeric(df[col], errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
                            if not col_series.empty:
                                numeric_limits[col] = {
                                    "min": float(col_series.min()),
                                    "max": float(col_series.max()),
                                }
                        dataset["model_artifacts"][selected_target] = {
                            "blob": pickle.dumps(best_model),
                            "trained_at": time.time(),
                            "plan": pricing_plan,
                            "feature_columns": trained_features,
                            "categorical_features": ml_results.get("feature_metadata", {}).get("categorical_features", []),
                            "numeric_features": ml_results.get("feature_metadata", {}).get("numeric_features", []),
                            "numeric_limits": numeric_limits,
                        }
                        logger.info(f"Rebuilt missing model artifact for {selected_target}")
                    if selected_target not in dataset["notebook_artifacts"]:
                        if dataset["summary"] is None:
                            dataset["summary"] = analyze_dataset(df)
                        notebook_blob = _generate_automl_notebook(
                            df=df,
                            filename=filename,
                            target_column=selected_target,
                            ml_results=ml_results,
                            summary=dataset["summary"],
                        )
                        dataset["notebook_artifacts"][selected_target] = {
                            "blob": notebook_blob,
                            "generated_at": time.time(),
                            "plan": pricing_plan,
                        }
                else:
                    start = perf_counter()
                    ml_results, best_model = run_ml_pipeline(
                        df,
                        target_column=selected_target,
                        pricing_plan=pricing_plan,
                        return_best_model=True,
                    )
                    ml_results["execution_time_ms"] = round((perf_counter() - start) * 1000, 2)
                    dataset["automl_cache"][selected_target] = {
                        "plan": pricing_plan,
                        "results": ml_results,
                    }
                    # Store model artifact immediately after training
                    logger.info(f"Storing model artifact for {selected_target}")
                    trained_features = ml_results.get("feature_metadata", {}).get("all_features", [])
                    trained_numeric = ml_results.get("feature_metadata", {}).get("numeric_features", [])
                    numeric_limits: dict[str, dict[str, float]] = {}
                    for col in trained_numeric:
                        col_series = pd.to_numeric(df[col], errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
                        if not col_series.empty:
                            numeric_limits[col] = {
                                "min": float(col_series.min()),
                                "max": float(col_series.max()),
                            }
                    dataset["model_artifacts"][selected_target] = {
                        "blob": pickle.dumps(best_model),
                        "trained_at": time.time(),
                        "plan": pricing_plan,
                        "feature_columns": trained_features,
                        "categorical_features": ml_results.get("feature_metadata", {}).get("categorical_features", []),
                        "numeric_features": ml_results.get("feature_metadata", {}).get("numeric_features", []),
                        "numeric_limits": numeric_limits,
                    }
                    logger.info(f"Model artifact stored successfully. Artifacts keys: {list(dataset['model_artifacts'].keys())}")
                    if dataset["summary"] is None:
                        dataset["summary"] = analyze_dataset(df)
                    notebook_blob = _generate_automl_notebook(
                        df=df,
                        filename=filename,
                        target_column=selected_target,
                        ml_results=ml_results,
                        summary=dataset["summary"],
                    )
                    dataset["notebook_artifacts"][selected_target] = {
                        "blob": notebook_blob,
                        "generated_at": time.time(),
                        "plan": pricing_plan,
                    }
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"ML pipeline failed: {exc}") from exc
    else:
        ml_results = cached_entry["results"]

    payload = {
        "dataset_id": dataset["id"],
        "filename": filename,
        "ml_results": ml_results,
        "target_column": selected_target,
        "pricing_plan": pricing_plan,
        "automl_cache_hit": automl_cache_hit,
    }
    return _json_safe(payload)


@app.get("/report")
async def export_report(dataset_id: str | None = None):
    """Download a JSON report combining summary and latest AutoML outputs."""
    dataset = _get_dataset(dataset_id)
    summary_payload = await dataset_summary(dataset_id=dataset["id"], preview_rows=10)
    target = list(dataset["automl_cache"].keys())[-1] if dataset["automl_cache"] else str(dataset["df"].columns[-1])

    cached_entry = dataset["automl_cache"].get(target)
    if cached_entry is not None:
        ml_results = cached_entry["results"]
    else:
        try:
            start = perf_counter()
            ml_results = run_ml_pipeline(
                dataset["df"],
                target_column=target,
                pricing_plan="free",
                return_best_model=False,
            )
            ml_results["execution_time_ms"] = round((perf_counter() - start) * 1000, 2)
            dataset["automl_cache"][target] = {
                "plan": "free",
                "results": ml_results,
            }
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Report AutoML generation failed: {exc}") from exc

    report = {
        "dataset_id": dataset["id"],
        "filename": dataset["filename"],
        "summary": summary_payload["summary"],
        "preview_rows": summary_payload["preview_rows"],
        "ml_results": ml_results,
        "strategy_explanation": _build_report_strategy_explanation(
            summary_payload["summary"],
            ml_results,
        ),
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


@app.get("/notebook/download")
async def download_notebook(
    dataset_id: str,
    target_column: str | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Download generated AutoML notebook artifact (.ipynb)."""
    if _resolve_effective_plan(authorization, db) != "pro":
        raise HTTPException(status_code=403, detail="Notebook download is available only for Pro plan users.")

    dataset = _get_dataset(dataset_id)
    selected_target = target_column or (list(dataset["automl_cache"].keys())[-1] if dataset["automl_cache"] else None)
    if not selected_target:
        raise HTTPException(status_code=400, detail="No AutoML results available. Run AutoML first.")

    artifact = dataset["notebook_artifacts"].get(selected_target)
    if not artifact:
        cached = dataset["automl_cache"].get(selected_target)
        if not cached:
            raise HTTPException(status_code=404, detail="No notebook artifact found for selected target.")
        if dataset["summary"] is None:
            dataset["summary"] = analyze_dataset(dataset["df"])
        notebook_blob = _generate_automl_notebook(
            df=dataset["df"],
            filename=dataset["filename"],
            target_column=selected_target,
            ml_results=cached["results"],
            summary=dataset["summary"],
        )
        artifact = {
            "blob": notebook_blob,
            "generated_at": time.time(),
            "plan": cached.get("plan", "free"),
        }
        dataset["notebook_artifacts"][selected_target] = artifact

    base_name = dataset["filename"].rsplit(".", 1)[0]
    return Response(
        content=artifact["blob"],
        media_type="application/x-ipynb+json",
        headers={"Content-Disposition": f'attachment; filename="{base_name}_{selected_target}.ipynb"'},
    )


@app.post("/predict")
async def predict(
    dataset_id: str,
    target_column: str | None = None,
    records: list[dict[str, Any]] | dict[str, Any] = Body(...),
):
    """Run predictions with a previously trained model using JSON feature records."""
    try:
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
        provided_columns = set(input_df.columns.tolist())
        expected_columns = artifact.get("feature_columns") or list(getattr(model, "feature_names_in_", []))
        if not expected_columns:
            raise HTTPException(status_code=500, detail="Model artifact is missing trained feature metadata.")
        
        categorical_features = artifact.get("categorical_features", [])
        numeric_features = artifact.get("numeric_features", [])
        numeric_limits = artifact.get("numeric_limits", {})
        unknown_columns = sorted([col for col in provided_columns if col not in set(expected_columns)])
        clipped_numeric: dict[str, dict[str, float]] = {}
        
        for col in expected_columns:
            if col not in input_df.columns:
                input_df[col] = np.nan
            elif col in categorical_features:
                try:
                    input_df[col] = input_df[col].astype(str).replace("nan", np.nan)
                except Exception:
                    pass
            elif col in numeric_features:
                try:
                    input_df[col] = pd.to_numeric(input_df[col], errors="coerce")
                except Exception:
                    pass

        numeric_errors: list[str] = []
        for col in numeric_features:
            if col not in provided_columns:
                continue
            invalid_rows = input_df[col].isna()
            if invalid_rows.any():
                numeric_errors.append(f"{col} must be numeric")
                continue
            limits = numeric_limits.get(col)
            if limits:
                min_val = limits.get("min")
                max_val = limits.get("max")
                if min_val is not None or max_val is not None:
                    original_col = input_df[col].copy()
                    if min_val is not None:
                        input_df[col] = input_df[col].clip(lower=min_val)
                    if max_val is not None:
                        input_df[col] = input_df[col].clip(upper=max_val)
                    changed_rows = int((input_df[col] != original_col).sum())
                    if changed_rows > 0:
                        clipped_numeric[col] = {
                            "min": float(min_val) if min_val is not None else None,
                            "max": float(max_val) if max_val is not None else None,
                            "adjusted_rows": changed_rows,
                        }

        if numeric_errors:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Prediction input validation failed.",
                    "code": "PREDICT_VALIDATION_ERROR",
                    "target_column": selected_target,
                    "invalid_numeric": list(dict.fromkeys(numeric_errors)),
                    "provided_columns": sorted(list(provided_columns)),
                    "expected_columns": expected_columns,
                    "unknown_columns": unknown_columns,
                    "numeric_limits": numeric_limits,
                },
            )
        
        input_df = input_df[expected_columns]
        
        predictions = model.predict(input_df).tolist()
        confidence_scores = None
        probability_by_class = None
        if hasattr(model, "predict_proba"):
            try:
                proba = model.predict_proba(input_df)
                classes = [str(label) for label in getattr(model, "classes_", [])]
                confidence_scores = [round(float(np.max(row)), 4) for row in proba]

                if classes and len(classes) == proba.shape[1]:
                    probability_by_class = [
                        {
                            classes[idx]: round(float(row[idx]), 6)
                            for idx in range(len(classes))
                        }
                        for row in proba
                    ]
                else:
                    probability_by_class = [
                        {
                            str(idx): round(float(row[idx]), 6)
                            for idx in range(len(row))
                        }
                        for row in proba
                    ]
            except Exception:
                confidence_scores = None
                probability_by_class = None

        payload = {
            "dataset_id": dataset_id,
            "target_column": selected_target,
            "count": len(predictions),
            "predictions": predictions,
            "confidence_scores": confidence_scores,
            "prediction_probabilities": probability_by_class,
            "average_confidence": round(float(np.mean(confidence_scores)), 4) if confidence_scores else None,
            "probability_available": probability_by_class is not None,
            "prediction_explanation": (
                "Confidence/probability is available for classification models exposing predict_proba."
                if probability_by_class is not None
                else "Probability is unavailable for this model type (commonly regression)."
            ),
            "success": True,
            "warnings": {
                "unknown_columns_ignored": unknown_columns,
                "numeric_values_clipped": clipped_numeric,
            },
        }
        return _json_safe(payload)
    except HTTPException:
        raise
    except Exception as exc:
        request_id = str(uuid4())
        logger.exception("Prediction error request_id=%s", request_id)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Prediction failed during model inference.",
                "code": "PREDICT_INFERENCE_ERROR",
                "error": str(exc),
                "error_type": type(exc).__name__,
                "request_id": request_id,
                "target_column": target_column,
            },
        ) from exc


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


# Catch-all route to serve React index.html for client-side routing
@app.get("/")
async def serve_root():
    """Serve React index.html at root."""
    index_file = os.path.join(react_dist_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    
    raise HTTPException(status_code=404, detail="React app not found. Please build the frontend first.")


@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve React index.html for all non-API routes to enable client-side routing."""
    # Don't interfere with actual files and API routes
    if full_path.startswith("api") or "." in full_path:
        raise HTTPException(status_code=404, detail="Not Found")
    
    index_file = os.path.join(react_dist_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    
    raise HTTPException(status_code=404, detail="React app not found. Please build the frontend first.")
