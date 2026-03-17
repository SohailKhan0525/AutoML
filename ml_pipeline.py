from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, precision_score, r2_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

RANDOM_STATE = 42
MAX_HIGH_CARDINALITY = 250
MAX_TRAIN_ROWS = 60000


def analyze_dataset(df: pd.DataFrame) -> dict[str, Any]:
    """Compute dataset-level statistics and a compact correlation view for the UI."""
    missing_by_column = {
        str(col): int(val)
        for col, val in df.isna().sum().sort_values(ascending=False).items()
    }

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


def run_ml_pipeline(
    df: pd.DataFrame,
    target_column: str | None = None,
    return_best_model: bool = False,
) -> Any:
    """Train baseline models and optionally return the best fitted pipeline for serving."""
    if df.shape[0] < 10:
        raise ValueError("Dataset must contain at least 10 rows for model training.")

    resolved_target = target_column or str(df.columns[-1])
    if resolved_target not in df.columns:
        raise ValueError(f"Target column '{resolved_target}' was not found in dataset.")

    X = df.drop(columns=[resolved_target]).copy()
    y = df[resolved_target].copy()

    if y.isna().all():
        raise ValueError("Target column contains only missing values.")

    sampled_rows = len(df)
    if len(df) > MAX_TRAIN_ROWS:
        sampled = df.sample(n=MAX_TRAIN_ROWS, random_state=RANDOM_STATE)
        X = sampled.drop(columns=[resolved_target]).copy()
        y = sampled[resolved_target].copy()
        sampled_rows = len(sampled)

    X, dropped_features = _drop_high_cardinality_features(X)
    if X.shape[1] == 0:
        raise ValueError("All feature columns were dropped due to very high cardinality.")

    task_type = detect_task_type(y)

    preprocessor, numeric_features, categorical_features = _build_preprocessor(X)

    if task_type == "classification":
        models: dict[str, Any] = {
            "Logistic Regression": LogisticRegression(
                max_iter=300,
                solver="liblinear",
                random_state=RANDOM_STATE,
            ),
            "Decision Tree": DecisionTreeClassifier(random_state=RANDOM_STATE),
            "Random Forest": RandomForestClassifier(
                n_estimators=50,
                max_depth=10,
                random_state=RANDOM_STATE,
                n_jobs=1,
            ),
        }
        metric_name = "accuracy"
        class_counts = y.value_counts(dropna=False)
        should_stratify = bool(class_counts.min() >= 2)
        split_kwargs = {"stratify": y if should_stratify else None}
    else:
        models = {
            "Decision Tree": DecisionTreeRegressor(random_state=RANDOM_STATE),
            "Random Forest": RandomForestRegressor(
                n_estimators=50,
                max_depth=10,
                random_state=RANDOM_STATE,
                n_jobs=1,
            ),
        }
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
    trained_models: dict[str, Pipeline] = {}

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
            else:
                score = r2_score(y_test, preds)
                mae = mean_absolute_error(y_test, preds)

            model_scores.append(
                {
                    "model_name": model_name,
                    "metric_name": metric_name,
                    "score": round(float(score), 4),
                    "precision": round(float(precision), 4) if task_type == "classification" else None,
                    "recall": round(float(recall), 4) if task_type == "classification" else None,
                    "f1_score": round(float(f1), 4) if task_type == "classification" else None,
                    "mae": round(float(mae), 4) if task_type == "regression" else None,
                }
            )

            if model_name == "Random Forest":
                trained_random_forest = pipeline
            trained_models[model_name] = pipeline
        except Exception as exc:
            model_failures.append({"model_name": model_name, "error": str(exc)})

    if not model_scores:
        raise ValueError("No models could be trained successfully for this dataset.")

    model_scores.sort(key=lambda x: x["score"], reverse=True)

    feature_importance: list[dict[str, Any]] = []
    if trained_random_forest is not None:
        pre = trained_random_forest.named_steps["preprocessor"]
        rf_model = trained_random_forest.named_steps["model"]

        transformed_features = pre.get_feature_names_out()
        importances = rf_model.feature_importances_
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

    best_model_name = model_scores[0]["model_name"]
    best_model = trained_models.get(best_model_name)

    result = {
        "task_type": task_type,
        "target_column": str(resolved_target),
        "numeric_feature_count": len(numeric_features),
        "categorical_feature_count": len(categorical_features),
        "trained_rows": int(sampled_rows),
        "dropped_feature_columns": dropped_features,
        "best_model_name": best_model_name,
        "quality_score": quality_score,
        "auto_insights": auto_insights,
        "model_scores": model_scores,
        "model_failures": model_failures,
        "feature_importance": feature_importance,
    }

    if return_best_model:
        return result, best_model
    return result
