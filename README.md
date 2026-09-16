# Planter

**From a location to an explainable farming decision.**

Planter is a Kenya-first farm intelligence prototype. A farmer selects a location and receives an evidence-backed view of current weather, climate patterns, terrain, agricultural risks, and crop suitability. The application separates measured, modelled, forecast, historical, and AI-generated information and never invents unavailable environmental data.

## Stack

- **Frontend:** React, TypeScript, Vite, Leaflet, React Leaflet, Recharts
- **Backend:** Python, FastAPI, Pydantic, HTTPX
- **Initial providers:** Open-Meteo forecast, archive, elevation, and geocoding APIs
- **Architecture:** provider abstractions with normalized evidence and explicit crop scoring

## Run locally

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend expects the API at `http://localhost:8000` by default. Override it with `VITE_API_BASE_URL`.

## Current prototype scope

- Pick a Kenyan coordinate using a map, GPS, coordinate entry, or place search.
- Load forecast weather, a responsible 21-day outlook, historical monthly climate, and elevation.
- Evaluate onions, maize, beans, potatoes, sorghum, or tomatoes with a documented rule-based method.
- Inspect reasons, risks, confidence, timestamps, and sources.
- Show unavailable datasets honestly instead of substituting invented values.

See [PLAN.md](PLAN.md) for the product plan and [.github/copilot-instructions.md](.github/copilot-instructions.md) for implementation guardrails.

## Responsible-use note

Planter is decision support, not a replacement for laboratory soil testing, official weather warnings, qualified agronomists, extension officers, veterinarians, or hydrogeological surveys.

