# Planter

**From a location to an explainable farming decision.**

Planter is an Eastern Africa farm intelligence prototype. A farmer selects a location and receives an evidence-backed view of current weather, climate patterns, terrain, agricultural risks, and crop suitability. The application separates measured, modelled, forecast, historical, and AI-generated information and never invents unavailable environmental data.

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

## User accounts

Saved farm projects require an account while public farm intelligence remains
available without signing in. Email/password signup and login use FastAPI Users,
Argon2 password hashing, and bearer JWTs. Set `PLANTER_AUTH_SECRET` to a long random
secret in production; local development generates an ignored persistent secret.

Microsoft Entra External ID support remains available in the backend for a later
Google/Facebook rollout, but federated buttons are intentionally hidden until those
providers are configured.

Existing SQLite farm projects created before authentication have no owner and are not
exposed to signed-in users. SQLite is intended for a single API instance; use durable
managed storage before scaling the backend horizontally.

## GitHub Pages

The React frontend is deployed from `main` to
[`https://amwaleh.github.io/Planter/`](https://amwaleh.github.io/Planter/) through
the generated `gh-pages` branch.

GitHub Pages serves static files and cannot run the Python/FastAPI backend. Set the
repository Actions variable `VITE_API_BASE_URL` to a publicly reachable backend URL
to enable live intelligence on the hosted frontend. Without it, the interface loads
but backend-dependent features remain unavailable.

Focused application pages:

- `/` — farm location and intelligence dashboard
- `/farm-projects` — guided mouse/touch drawing for multiple separate farm parcels, vertex editing, place search, named activity sections, in-place project updates, switchable map layers, tooltips, marker details, and fit-to-bounds controls
- `/crop-knowledge` — broad East African fruit and vegetable catalog, attributed plant images, validated crop rules, and sourced custom-rule creation
- `/water` — rainfall, irrigation signals, mapped surface water, and explicit groundwater/piped-water limitations
- `/land` — click-to-analyze terrain map with selectable SoilGrids pH, texture, carbon, nitrogen, CEC, and bulk-density overlays plus field-verification guidance
- `/livestock` — deterministic livestock suitability with visible constraints
- `/assistant` — evidence-grounded answers for supported farm questions

## Current prototype scope

- Pick an Eastern Africa coordinate using a map, GPS, coordinate entry, place search, or a pasted Google Maps share link.
- Draw one or more separate farm parcel boundaries, divide the farm into named activity/crop sections, and save or reload the farm project.
- Load current weather, the previous 21 days of conditions, a responsible 21-day outlook, ten-year monthly climate, current-year rainfall comparison, and elevation.
- Track NOAA CPC El Niño, Neutral, and La Niña probabilities plus the recent ONI trend, with cautious Eastern Africa context and links to ICPAC seasonal outlooks.
- Search a broad, non-exhaustive East African fruit and vegetable catalog, including common aliases and spelling correction. Only crops with validated prototype rules can be scored.
- Inspect the crop rules behind recommendations and add sourced custom rules for additional crops.
- Inspect practical reasons, risks, confidence, timestamps, and sources; the detailed explainability section stays collapsed until needed.
- Show unavailable datasets honestly instead of substituting invented values.

The current coordinate region covers the Eastern African mainland from Tanzania and Burundi north through South Sudan, Ethiopia, Eritrea, Djibouti, and Somalia. Environmental provider coverage is broad, but authoritative crop calendars, extension guidance, utility data, and hydrogeological evidence vary by country and must be labelled accordingly.

See [PLAN.md](PLAN.md) for the product plan and [.github/copilot-instructions.md](.github/copilot-instructions.md) for implementation guardrails.

## Responsible-use note

Planter is decision support, not a replacement for laboratory soil testing, official weather warnings, qualified agronomists, extension officers, veterinarians, or hydrogeological surveys.
