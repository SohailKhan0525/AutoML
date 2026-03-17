# AutoML Dataset Analyzer

A FastAPI-powered SaaS prototype that lets users upload CSV datasets, run automated baseline ML models, and view dataset diagnostics directly in a dashboard UI.

## Tech Stack

- Backend: FastAPI, pandas, numpy, scikit-learn
- Frontend: HTML + Tailwind CSS + vanilla JavaScript

## Project Structure

project/
- main.py
- ml_pipeline.py
- templates/
	- index.html
- static/
	- app.js
- requirements.txt

## Features Implemented

- CSV upload with client-side and server-side validation
- Dataset summary:
	- row count
	- column count
	- column names
	- missing values per column
- Automated target detection (last column)
- ML training pipeline with preprocessing:
	- Logistic Regression (classification)
	- Decision Tree
	- Random Forest
- Model evaluation:
	- Accuracy for classification
	- R2 for regression
- Feature importance from Random Forest
- Dynamic dashboard rendering of all API results

## Run Locally

1. Install dependencies:

	 python3 -m pip install -r requirements.txt

2. Start the app:

	 uvicorn main:app --reload

3. Open in your browser:

	 http://127.0.0.1:8000

## API

- POST /upload
	- form-data field: file (CSV)
	- Stores dataset in bounded in-memory cache and returns dataset_id
	- Returns parse_time_ms for lightweight performance visibility
- GET /summary
	- Query params: dataset_id (optional), preview_rows (optional, max 20)
	- Returns dataset stats and preview rows
- POST /run-automl
	- Query params: dataset_id (optional)
	- Runs ML pipeline on the uploaded dataset and returns metrics + feature importance
	- Results are cached per dataset to avoid repeated retraining

## Notes

- Target column is assumed to be the last column in the uploaded CSV.
- Datasets with fewer than 10 rows are rejected to avoid unstable model metrics.
- If the uploaded file is invalid or malformed, the API returns a structured error message.
- High-cardinality text columns are dropped automatically to prevent memory blowups on low-resource servers.
