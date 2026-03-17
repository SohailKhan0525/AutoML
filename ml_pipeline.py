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


def detect_task_type(y: pd.Series) -> str:
    if y.dtype == "O" or str(y.dtype).startswith("category") or y.dtype == bool:
        return "classification"

    unique_count = y.nunique(dropna=True)
    sample_size = max(len(y), 1)
    unique_ratio = unique_count / sample_size

    if unique_count <= 20 and unique_ratio < 0.2:
        return "classification"
    return "regression"


def _build_preprocessor(X: pd.DataFrame) -> tuple[ColumnTransformer, list[str], list[str]]:
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
                    max_categories=25,
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


def run_ml_pipeline(df: pd.DataFrame) -> dict[str, Any]:
    if df.shape[0] < 10:
        raise ValueError("Dataset must contain at least 10 rows for model training.")

    target_column = df.columns[-1]
    X = df.iloc[:, :-1].copy()
    y = df.iloc[:, -1].copy()

    if y.isna().all():
        raise ValueError("Target column contains only missing values.")

    sampled_rows = len(df)
    if len(df) > MAX_TRAIN_ROWS:
        if detect_task_type(y) == "classification":
            sampled = df.sample(n=MAX_TRAIN_ROWS, random_state=RANDOM_STATE)
        else:
            sampled = df.sample(n=MAX_TRAIN_ROWS, random_state=RANDOM_STATE)
        X = sampled.iloc[:, :-1].copy()
        y = sampled.iloc[:, -1].copy()
        sampled_rows = len(sampled)

    X, dropped_features = _drop_high_cardinality_features(X)
    if X.shape[1] == 0:
        raise ValueError("All feature columns were dropped due to very high cardinality.")

    task_type = detect_task_type(y)

    preprocessor, numeric_features, categorical_features = _build_preprocessor(X)

    if task_type == "classification":
        models: dict[str, Any] = {
            "Logistic Regression": LogisticRegression(max_iter=300, random_state=RANDOM_STATE),
            "Decision Tree": DecisionTreeClassifier(random_state=RANDOM_STATE),
            "Random Forest": RandomForestClassifier(
                n_estimators=120,
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
                n_estimators=120,
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

    return {
        "task_type": task_type,
        "target_column": str(target_column),
        "numeric_feature_count": len(numeric_features),
        "categorical_feature_count": len(categorical_features),
        "trained_rows": int(sampled_rows),
        "dropped_feature_columns": dropped_features,
        "model_scores": model_scores,
        "model_failures": model_failures,
        "feature_importance": feature_importance,
    }
