# Orbital AI

AI-Driven Collision Risk Assessment and Orchestration System for Mega-Constellation Satellites.

A physics-plus-AI decision-support platform that ingests satellite and debris tracking data, computes conjunction risk using both classical orbital mechanics and machine learning, explains each alert's reasoning, prioritizes and orchestrates alerts across multi-satellite constellations, and lets operators simulate and avoid maneuvers before human-approved execution.

## Architecture

```
TLE / State Vectors
    |
    v
Orbit Propagation (SGP4/SDP4)
    |
    v
Conjunction Detection (broad-phase -> fine propagation)
    |
    v
Feature Engineering (8 physics features)
    |
    v
ML Risk Prediction (XGBoost, R^2 0.79, AUC 0.97)
    |
    v
6-Agent Orchestration Pipeline
    |-> Monitoring Agent
    |-> Risk Agent
    |-> Analysis Agent
    |-> Maneuver Agent
    |-> Validation Agent
    |-> Explanation Agent
    |
    v
Maneuver Simulation + Deterministic Ranking
    |
    v
Explainable Recommendation + Human Approval Gate
```

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:8080

### Train ML Models (optional — pre-trained models included)

```bash
cd backend
python scripts/train_models.py
```

## Key Features

- **Real XGBoost models** trained on physics-generated synthetic labels (ROC-AUC 0.97, precision 0.90)
- **6-agent orchestration pipeline** with per-agent retries, circuit breaker, loop detection, and timeout
- **Deterministic maneuver ranking** — physics + ML scoring, not arbitrary LLM selection
- **Human-in-the-loop** — HIGH/CRITICAL workflows require explicit operator approval; nothing auto-executes
- **Explainable AI** — every alert exposes structured reasons from computed physics values, not fabricated text
- **Mock vs Real mode** — MOCK_ML_MODE for development, REAL mode with trained models for production
- **247 tests** — physics, ML, agents, orchestration, API endpoints

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Live Orbital View | `/` | Full-screen 3D globe with real CelesTrak satellites (SGP4 propagation) |
| Mission Control | `/mission-control` | Command dashboard with metrics, alerts, AI analysis |
| Collision Risk | `/collision-risk` | Risk detail with probability chart, maneuver simulation |
| Constellations | `/constellations` | Fleet management with Starlink/OneWeb/GPS filtering |
| Predictions | `/predictions` | 24h forecast, risk distribution, density heatmap |
| Alerts | `/alerts` | Severity-filtered conjunction alert queue |
| Analytics | `/analytics` | Model performance, engine metrics, network exposure |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Three.js, Recharts, TanStack Router |
| Backend | Python, FastAPI, SGP4, XGBoost, scikit-learn, SHAP |
| Database | Supabase (PostgreSQL) with in-memory fallback |
| ML | XGBoost regressor + classifier, physics-based synthetic training |
| Agents | Typed state machine with 6 deterministic agents |

## Limitations

- Uses SGP4-level propagation accuracy (~km-level over days)
- Trained on synthetic physics labels, not historical collision outcomes
- Orchestrator persistence uses in-memory store (Supabase optional)
- Not certified for operational use — decision-support prototype only

# 🤝 Contribution

| Role | Contributor |
|---|---|
| Frontend Development | Vinayak Kesarkar & Amaan Huda |
| Backend Development  | Arpan Maurya |
| Machine Learning     |  Rehan Khan |
 
