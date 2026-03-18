from __future__ import annotations

from typing import Any
import re

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, mean_squared_error, precision_score, r2_score, recall_score
from sklearn.model_selection import RandomizedSearchCV, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

RANDOM_STATE = 42
MAX_HIGH_CARDINALITY = 250
MAX_TRAIN_ROWS = 60000
FREE_PLAN_MAX_TRAIN_ROWS = 15000
FREE_PLAN_CV_FOLDS = 0
PRO_PLAN_CV_FOLDS = 5
PRO_PLAN_TUNING_ITERATIONS = 8


def analyze_dataset(df: pd.DataFrame) -> dict[str, Any]:
    """Compute dataset-level statistics and a compact correlation view for the UI."""
    missing_by_column = {
        str(col): int(val)
        for col, val in df.isna().sum().sort_values(ascending=False).items()
    }

    # Collect column statistics for UI rendering (especially categorical dropdowns)
    column_stats = {}
    for col in df.columns:
        col_str = str(col)
        stats: dict[str, Any] = {"dtype": str(df[col].dtype)}
        series = df[col]
        numeric_series = pd.to_numeric(series, errors="coerce")
        is_boolean = pd.api.types.is_bool_dtype(series)
        is_numeric = (pd.api.types.is_numeric_dtype(series) and not is_boolean) or (
            numeric_series.notna().sum() > 0 and not is_boolean
        )

        if is_numeric:
            finite_values = numeric_series.replace([np.inf, -np.inf], np.nan).dropna()
            if not finite_values.empty:
                stats["min"] = float(finite_values.min())
                stats["max"] = float(finite_values.max())
                stats["p01"] = float(finite_values.quantile(0.01))
                stats["p99"] = float(finite_values.quantile(0.99))
        
        # For categorical/object columns, get unique values
        if series.dtype == "object" or series.nunique() < 20:
            unique_vals = series.dropna().astype(str).unique().tolist()
            # Limit to first 50 unique values for UI
            stats["unique_values"] = unique_vals[:50]
            stats["unique_count"] = len(unique_vals)
        
        column_stats[col_str] = stats

    correlation_summary = {
        "available": False,
        "columns": [],
        "matrix": [],
        "top_pairs": [],
    }
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if len(numeric_cols) >= 2:
        corr_df = df[numeric_cols].corr(numeric_only=True).fillna(0.0)
        selected_cols = numeric_cols[:8]
        matrix = corr_df.loc[selected_cols, selected_cols].round(3).values.tolist()

        top_pairs: list[dict[str, Any]] = []
        for i in range(len(numeric_cols)):
            for j in range(i + 1, len(numeric_cols)):
                c1 = numeric_cols[i]
                c2 = numeric_cols[j]
                corr_value = corr_df.loc[c1, c2]
                top_pairs.append(
                    {
                        "feature_1": str(c1),
                        "feature_2": str(c2),
                        "correlation": round(float(corr_value), 4),
                        "abs_correlation": round(float(abs(corr_value)), 4),
                    }
                )

        top_pairs.sort(key=lambda item: item["abs_correlation"], reverse=True)
        correlation_summary = {
            "available": True,
            "columns": [str(c) for c in selected_cols],
            "matrix": matrix,
            "top_pairs": top_pairs[:10],
        }

    return {
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "column_names": [str(col) for col in df.columns.tolist()],
        "column_stats": column_stats,
        "missing_values_by_column": missing_by_column,
        "total_missing_values": int(df.isna().sum().sum()),
        "missing_percentage": round(float(df.isna().sum().sum() / df.size * 100), 4) if df.size else 0.0,
        "correlation": correlation_summary,
    }


def optimize_dataframe_memory(df: pd.DataFrame) -> pd.DataFrame:
    """Downcast numeric columns and encode small categorical columns to reduce memory usage."""
    optimized = df.copy()

    for col in optimized.select_dtypes(include=["int64", "int32"]).columns:
        optimized[col] = pd.to_numeric(optimized[col], downcast="integer")

    for col in optimized.select_dtypes(include=["float64"]).columns:
        optimized[col] = pd.to_numeric(optimized[col], downcast="float")

    for col in optimized.select_dtypes(include=["object"]).columns:
        nunique = optimized[col].nunique(dropna=True)
        total = len(optimized[col])
        if total and nunique / total < 0.4:
            optimized[col] = optimized[col].astype("category")

    return optimized


def compute_dataset_quality_score(df: pd.DataFrame, task_type: str, target_column: str) -> dict[str, Any]:
    """Return a heuristic dataset quality score and factors used to build it."""
    missing_pct = float(df.isna().sum().sum() / df.size * 100) if df.size else 0.0
    score = 100.0
    score -= min(missing_pct * 1.2, 40.0)

    imbalance_penalty = 0.0
    if task_type == "classification" and target_column in df.columns:
        counts = df[target_column].value_counts(dropna=False)
        if not counts.empty and counts.min() > 0:
            ratio = float(counts.max() / counts.min())
            imbalance_penalty = min(max((ratio - 1.0) * 6.0, 0.0), 30.0)
            score -= imbalance_penalty

    score -= min(max(df.shape[1] - 30, 0) * 0.8, 15.0)
    score = max(0.0, min(100.0, score))

    return {
        "score": round(score, 2),
        "missing_percentage": round(missing_pct, 4),
        "imbalance_penalty": round(imbalance_penalty, 2),
    }


def build_auto_insights(
    task_type: str,
    quality_score: dict[str, Any],
    feature_importance: list[dict[str, Any]],
    missing_percentage: float,
) -> list[str]:
    """Generate lightweight business-friendly insights for quick interpretation."""
    insights = [f"Dataset appears suitable for {task_type} modeling."]

    if feature_importance:
        top_feature = feature_importance[0]["feature"]
        insights.append(f"Top feature influencing predictions: {top_feature}.")

    if missing_percentage < 2:
        insights.append("Missing values are low and unlikely to hurt baseline model quality.")
    elif missing_percentage < 10:
        insights.append("Missing values are moderate; imputation strategy matters.")
    else:
        insights.append("Missing values are high; data cleaning should be prioritized.")

    score = quality_score.get("score", 0)
    if score >= 80:
        insights.append("Overall dataset quality is high for baseline AutoML.")
    elif score >= 60:
        insights.append("Dataset quality is acceptable but has room for improvement.")
    else:
        insights.append("Dataset quality is low; feature engineering and cleanup are recommended.")

    return insights


def detect_task_type(y: pd.Series) -> str:
    """Infer whether the target should be treated as classification or regression."""
    if y.dtype == "O" or str(y.dtype).startswith("category") or y.dtype == bool:
        return "classification"

    unique_count = y.nunique(dropna=True)
    sample_size = max(len(y), 1)
    unique_ratio = unique_count / sample_size

    if unique_count <= 20 and unique_ratio < 0.2:
        return "classification"
    return "regression"


def _build_preprocessor(X: pd.DataFrame) -> tuple[ColumnTransformer, list[str], list[str]]:
    """Create a memory-aware preprocessing pipeline for numeric and categorical features."""
    numeric_features = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical_features = [col for col in X.columns if col not in numeric_features]

    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_transformer = Pipeline(
        steps=[
            (
                "onehot",
                OneHotEncoder(
                    handle_unknown="ignore",
                    min_frequency=0.01,
                    max_categories=15,
                    sparse_output=True,
                ),
            ),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            ("cat", categorical_transformer, categorical_features),
        ],
        remainder="drop",
    )

    return preprocessor, numeric_features, categorical_features


def _drop_high_cardinality_features(X: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Drop very high cardinality text features that can blow up OHE dimensionality."""
    dropped: list[str] = []
    kept = X.copy()

    for col in kept.columns:
        if pd.api.types.is_numeric_dtype(kept[col]):
            continue

        unique_count = kept[col].nunique(dropna=True)
        if unique_count > MAX_HIGH_CARDINALITY:
            dropped.append(str(col))

    if dropped:
        kept = kept.drop(columns=dropped)

    # Normalize categorical features to string for stable sklearn preprocessing.
    for col in kept.columns:
        if not pd.api.types.is_numeric_dtype(kept[col]):
            kept[col] = kept[col].astype("object").where(kept[col].notna(), "missing")

    return kept, dropped


def _drop_target_leakage_features(
    X: pd.DataFrame,
    y: pd.Series,
    task_type: str,
    target_column: str,
) -> tuple[pd.DataFrame, list[str]]:
    """Drop columns that deterministically encode the target (target leakage)."""
    dropped: list[str] = []
    kept = X.copy()

    target_name_norm = re.sub(r"[^a-z0-9]", "", str(target_column).lower())
    y_cmp = y.astype("object").where(y.notna(), "missing").astype(str).str.strip().str.lower()

    for col in list(kept.columns):
        col_name_norm = re.sub(r"[^a-z0-9]", "", str(col).lower())
        if col_name_norm == target_name_norm:
            dropped.append(str(col))
            continue

        x_raw = kept[col]
        x_cmp = x_raw.astype("object").where(x_raw.notna(), "missing").astype(str).str.strip().str.lower()

        # Exact row-wise equality with target is direct leakage.
        if x_cmp.equals(y_cmp):
            dropped.append(str(col))
            continue

        if task_type == "classification":
            paired = pd.DataFrame({"x": x_cmp, "y": y_cmp})
            if len(paired) >= 10:
                unique_targets_per_value = paired.groupby("x")["y"].nunique(dropna=False)
                # If each feature value maps to exactly one target value, it leaks target information.
                if not unique_targets_per_value.empty and int(unique_targets_per_value.max()) == 1:
                    value_cardinality_ratio = paired["x"].nunique(dropna=False) / max(len(paired), 1)
                    if value_cardinality_ratio < 0.8:
                        dropped.append(str(col))
                        continue
        else:
            x_num = pd.to_numeric(x_raw, errors="coerce")
            y_num = pd.to_numeric(y, errors="coerce")
            valid_mask = x_num.notna() & y_num.notna()
            if int(valid_mask.sum()) >= 30:
                corr_value = x_num[valid_mask].corr(y_num[valid_mask])
                if pd.notna(corr_value) and abs(float(corr_value)) >= 0.999:
                    dropped.append(str(col))

    if dropped:
        kept = kept.drop(columns=dropped)

    return kept, dropped


def run_ml_pipeline(
    df: pd.DataFrame,
    target_column: str | None = None,
    pricing_plan: str = "free",
    return_best_model: bool = False,
) -> Any:
    """Train baseline models and optionally return the best fitted pipeline for serving."""
    if df.shape[0] < 10:
        raise ValueError("Dataset must contain at least 10 rows for model training.")

    resolved_target = target_column or str(df.columns[-1])
    if resolved_target not in df.columns:
        raise ValueError(f"Target column '{resolved_target}' was not found in dataset.")

    normalized_plan = str(pricing_plan or "free").strip().lower()
    if normalized_plan not in {"free", "pro"}:
        normalized_plan = "free"

    train_row_limit = MAX_TRAIN_ROWS if normalized_plan == "pro" else FREE_PLAN_MAX_TRAIN_ROWS
    cv_folds = PRO_PLAN_CV_FOLDS if normalized_plan == "pro" else FREE_PLAN_CV_FOLDS
    hyperparameter_tuning_enabled = normalized_plan == "pro"

    X = df.drop(columns=[resolved_target]).copy()
    y = df[resolved_target].copy()

    if y.isna().all():
        raise ValueError("Target column contains only missing values.")

    sampled_rows = len(df)
    if len(df) > train_row_limit:
        sampled = df.sample(n=train_row_limit, random_state=RANDOM_STATE)
        X = sampled.drop(columns=[resolved_target]).copy()
        y = sampled[resolved_target].copy()
        sampled_rows = len(sampled)

    task_type = detect_task_type(y)

    X, dropped_features = _drop_high_cardinality_features(X)
    X, leakage_features = _drop_target_leakage_features(X, y, task_type, resolved_target)
    if X.shape[1] == 0:
        raise ValueError("All feature columns were dropped due to high cardinality or target leakage.")

    preprocessor, numeric_features, categorical_features = _build_preprocessor(X)

    if task_type == "classification":
        models: dict[str, Any] = {
            "Logistic Regression": LogisticRegression(
                max_iter=300,
                solver="liblinear",
                random_state=RANDOM_STATE,
            ),
            "Decision Tree": DecisionTreeClassifier(random_state=RANDOM_STATE),
        }

        if normalized_plan == "pro":
            models["Random Forest"] = RandomForestClassifier(
                n_estimators=120,
                max_depth=14,
                random_state=RANDOM_STATE,
                n_jobs=1,
            )

        metric_name = "accuracy"
        class_counts = y.value_counts(dropna=False)
        should_stratify = bool(class_counts.min() >= 2)
        split_kwargs = {"stratify": y if should_stratify else None}
    else:
        models = {
            "Decision Tree": DecisionTreeRegressor(random_state=RANDOM_STATE),
        }

        if normalized_plan == "pro":
            models["Random Forest"] = RandomForestRegressor(
                n_estimators=120,
                max_depth=14,
                random_state=RANDOM_STATE,
                n_jobs=1,
            )

        metric_name = "r2"
        split_kwargs = {"stratify": None}

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=RANDOM_STATE,
        **split_kwargs,
    )

    model_scores: list[dict[str, Any]] = []
    model_failures: list[dict[str, str]] = []
    trained_random_forest: Pipeline | None = None
    trained_decision_tree: Pipeline | None = None
    trained_models: dict[str, Pipeline] = {}
    cross_validation_results: list[dict[str, Any]] = []
    tuning_summary: dict[str, Any] = {
        "enabled": hyperparameter_tuning_enabled,
        "method": "randomized_search" if hyperparameter_tuning_enabled else "none",
        "best_model": None,
        "best_score": None,
        "best_params": {},
        "n_iter": PRO_PLAN_TUNING_ITERATIONS if hyperparameter_tuning_enabled else 0,
    }

    for model_name, model in models.items():
        try:
            pipeline = Pipeline(steps=[("preprocessor", preprocessor), ("model", model)])
            pipeline.fit(X_train, y_train)
            preds = pipeline.predict(X_test)

            if task_type == "classification":
                score = accuracy_score(y_test, preds)
                precision = precision_score(y_test, preds, average="weighted", zero_division=0)
                recall = recall_score(y_test, preds, average="weighted", zero_division=0)
                f1 = f1_score(y_test, preds, average="weighted", zero_division=0)
                rmse = None
            else:
                score = r2_score(y_test, preds)
                mae = mean_absolute_error(y_test, preds)
                rmse = float(np.sqrt(mean_squared_error(y_test, preds)))

            model_scores.append(
                {
                    "model_name": model_name,
                    "metric_name": metric_name,
                    "score": round(float(score), 4),
                    "precision": round(float(precision), 4) if task_type == "classification" else None,
                    "recall": round(float(recall), 4) if task_type == "classification" else None,
                    "f1_score": round(float(f1), 4) if task_type == "classification" else None,
                    "mae": round(float(mae), 4) if task_type == "regression" else None,
                    "rmse": round(float(rmse), 4) if task_type == "regression" else None,
                }
            )

            if cv_folds > 1:
                cv_metric = "accuracy" if task_type == "classification" else "r2"
                cv_scores = cross_val_score(
                    pipeline,
                    X,
                    y,
                    cv=cv_folds,
                    scoring=cv_metric,
                    n_jobs=1,
                )
                cross_validation_results.append(
                    {
                        "model_name": model_name,
                        "metric_name": cv_metric,
                        "folds": cv_folds,
                        "mean_score": round(float(np.mean(cv_scores)), 4),
                        "std_score": round(float(np.std(cv_scores)), 4),
                    }
                )

            if model_name == "Random Forest":
                trained_random_forest = pipeline
            if model_name == "Decision Tree":
                trained_decision_tree = pipeline
            trained_models[model_name] = pipeline
        except Exception as exc:
            model_failures.append({"model_name": model_name, "error": str(exc)})

    if not model_scores:
        raise ValueError("No models could be trained successfully for this dataset.")

    model_scores.sort(key=lambda x: x["score"], reverse=True)

    if hyperparameter_tuning_enabled and "Random Forest" in models:
        try:
            rf_estimator = models["Random Forest"]
            rf_pipeline = Pipeline(steps=[("preprocessor", preprocessor), ("model", rf_estimator)])

            if task_type == "classification":
                param_dist = {
                    "model__n_estimators": [80, 120, 180],
                    "model__max_depth": [8, 12, 16, None],
                    "model__min_samples_split": [2, 4, 8],
                    "model__min_samples_leaf": [1, 2, 4],
                }
                tuning_metric = "accuracy"
            else:
                param_dist = {
                    "model__n_estimators": [80, 120, 180],
                    "model__max_depth": [8, 12, 16, None],
                    "model__min_samples_split": [2, 4, 8],
                    "model__min_samples_leaf": [1, 2, 4],
                }
                tuning_metric = "r2"

            search = RandomizedSearchCV(
                estimator=rf_pipeline,
                param_distributions=param_dist,
                n_iter=PRO_PLAN_TUNING_ITERATIONS,
                cv=max(3, cv_folds),
                scoring=tuning_metric,
                random_state=RANDOM_STATE,
                n_jobs=1,
                refit=True,
            )
            search.fit(X_train, y_train)

            tuned_pipeline = search.best_estimator_
            tuned_preds = tuned_pipeline.predict(X_test)

            if task_type == "classification":
                tuned_score = accuracy_score(y_test, tuned_preds)
                tuned_precision = precision_score(y_test, tuned_preds, average="weighted", zero_division=0)
                tuned_recall = recall_score(y_test, tuned_preds, average="weighted", zero_division=0)
                tuned_f1 = f1_score(y_test, tuned_preds, average="weighted", zero_division=0)

                tuned_result = {
                    "model_name": "Random Forest (Tuned)",
                    "metric_name": metric_name,
                    "score": round(float(tuned_score), 4),
                    "precision": round(float(tuned_precision), 4),
                    "recall": round(float(tuned_recall), 4),
                    "f1_score": round(float(tuned_f1), 4),
                    "mae": None,
                    "rmse": None,
                }
            else:
                tuned_score = r2_score(y_test, tuned_preds)
                tuned_mae = mean_absolute_error(y_test, tuned_preds)
                tuned_rmse = float(np.sqrt(mean_squared_error(y_test, tuned_preds)))

                tuned_result = {
                    "model_name": "Random Forest (Tuned)",
                    "metric_name": metric_name,
                    "score": round(float(tuned_score), 4),
                    "precision": None,
                    "recall": None,
                    "f1_score": None,
                    "mae": round(float(tuned_mae), 4),
                    "rmse": round(float(tuned_rmse), 4),
                }

            model_scores = [
                score_item
                for score_item in model_scores
                if score_item["model_name"] != "Random Forest"
            ]
            model_scores.append(tuned_result)
            model_scores.sort(key=lambda x: x["score"], reverse=True)

            trained_random_forest = tuned_pipeline
            trained_models["Random Forest (Tuned)"] = tuned_pipeline

            tuning_summary = {
                "enabled": True,
                "method": "randomized_search",
                "best_model": "Random Forest (Tuned)",
                "best_score": round(float(search.best_score_), 4),
                "best_params": {k: v for k, v in search.best_params_.items()},
                "n_iter": PRO_PLAN_TUNING_ITERATIONS,
            }
        except Exception as exc:
            model_failures.append({"model_name": "Random Forest (Tuned)", "error": f"Tuning failed: {exc}"})

    feature_importance: list[dict[str, Any]] = []
    importance_pipeline = trained_random_forest or trained_decision_tree
    feature_model = None
    if importance_pipeline is not None:
        pre = importance_pipeline.named_steps["preprocessor"]
        feature_model = importance_pipeline.named_steps["model"]

        if not hasattr(feature_model, "feature_importances_"):
            feature_model = None

    if importance_pipeline is not None and feature_model is not None:
        transformed_features = pre.get_feature_names_out()
        importances = feature_model.feature_importances_
        top_indices = np.argsort(importances)[::-1][:10]

        feature_importance = [
            {
                "feature": str(transformed_features[idx]),
                "importance": round(float(importances[idx]), 4),
            }
            for idx in top_indices
        ]

    quality_score = compute_dataset_quality_score(df, task_type, resolved_target)
    auto_insights = build_auto_insights(
        task_type=task_type,
        quality_score=quality_score,
        feature_importance=feature_importance,
        missing_percentage=quality_score["missing_percentage"],
    )
    if leakage_features:
        auto_insights.append(
            f"Dropped potential leakage features: {', '.join(sorted(leakage_features)[:6])}."
        )

    best_model_name = model_scores[0]["model_name"]
    best_model = trained_models.get(best_model_name)

    feature_metadata = {
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "all_features": [str(c) for c in X.columns.tolist()],
    }

    all_dropped_features = sorted(set([str(col) for col in dropped_features + leakage_features]))

    result = {
        "pricing_plan": normalized_plan,
        "workflow_mode": "Advanced Mode" if normalized_plan == "pro" else "Fast Mode",
        "plan_limits": {
            "max_train_rows": int(train_row_limit),
            "advanced_models_enabled": normalized_plan == "pro",
            "cross_validation_folds": int(cv_folds),
            "hyperparameter_tuning_enabled": hyperparameter_tuning_enabled,
        },
        "workflow_steps": [
            "Import libraries",
            "Load dataset",
            "Explore data (EDA)",
            "Handle missing values",
            "Encode categorical variables",
            "Feature engineering",
            "Split data",
            "Scale/normalize features",
            "Choose model",
            "Train model",
            "Make predictions",
            "Evaluate model",
            "Hyperparameter tuning",
            "Cross-validation",
            "Save model",
            "Deploy model",
        ],
        "task_type": task_type,
        "target_column": str(resolved_target),
        "numeric_feature_count": len(numeric_features),
        "categorical_feature_count": len(categorical_features),
        "trained_rows": int(sampled_rows),
        "dropped_feature_columns": all_dropped_features,
        "leakage_feature_columns": sorted([str(col) for col in leakage_features]),
        "best_model_name": best_model_name,
        "quality_score": quality_score,
        "auto_insights": auto_insights,
        "model_scores": model_scores,
        "cross_validation": cross_validation_results,
        "hyperparameter_tuning": tuning_summary,
        "model_failures": model_failures,
        "feature_importance": feature_importance,
        "feature_metadata": feature_metadata,
    }

    if return_best_model:
        return result, best_model
    return result
