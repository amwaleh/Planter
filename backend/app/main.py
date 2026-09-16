from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError

from .crop_data import CROP_RULES, crop_display_name, resolve_crop_name
from .map_links import resolve_google_maps_link
from .models import (
    CropRuleCreate,
    CropRuleRecord,
    FarmProject,
    FarmProjectCreate,
    FarmReport,
    LocationMatch,
    MapLinkResolution,
)
from .providers.open_meteo import OpenMeteoProvider
from .service import create_farm_report
from .storage import (
    get_farm_project,
    initialize_storage,
    list_crop_rules,
    list_farm_projects,
    save_crop_rule,
    save_farm_project,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_storage()
    yield

app = FastAPI(
    title="Planter API",
    version="0.1.0",
    description="Evidence-first farm intelligence for Kenya.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
provider = OpenMeteoProvider()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/farm-report", response_model=FarmReport)
async def farm_report(
    latitude: float = Query(ge=-4.9, le=5.0),
    longitude: float = Query(ge=33.5, le=42.1),
    crop: str = Query(default="onion"),
) -> FarmReport:
    normalized_crop, was_corrected, suggestions = resolve_crop_name(crop)
    if normalized_crop is None:
        suggestion_text = (
            f" Did you mean: {', '.join(suggestions)}?" if suggestions else ""
        )
        raise HTTPException(
            status_code=400,
            detail=f"Crop rules are not available for '{crop.strip()}'.{suggestion_text}",
        )
    try:
        return await create_farm_report(
            latitude,
            longitude,
            normalized_crop,
            provider,
            requested_crop=crop.strip(),
            crop_was_corrected=was_corrected,
        )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Environmental provider request failed: {error}",
        ) from error


@app.get("/api/v1/crops", response_model=list[str])
async def crops() -> list[str]:
    return sorted(crop_display_name(crop) for crop in CROP_RULES)


@app.get("/api/v1/crop-rules", response_model=list[CropRuleRecord])
async def crop_rules() -> list[CropRuleRecord]:
    return list_crop_rules()


@app.post("/api/v1/crop-rules", response_model=CropRuleRecord, status_code=201)
async def create_crop_rule(payload: CropRuleCreate) -> CropRuleRecord:
    if payload.temperature_min_c >= payload.temperature_max_c:
        raise HTTPException(status_code=400, detail="Maximum temperature must exceed minimum.")
    if payload.monthly_rainfall_min_mm >= payload.monthly_rainfall_max_mm:
        raise HTTPException(status_code=400, detail="Maximum rainfall must exceed minimum.")
    if payload.elevation_min_m >= payload.elevation_max_m:
        raise HTTPException(status_code=400, detail="Maximum elevation must exceed minimum.")
    if payload.duration_min_days > payload.duration_max_days:
        raise HTTPException(status_code=400, detail="Maximum duration must not be lower than minimum.")
    try:
        return save_crop_rule(payload)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/v1/projects", response_model=list[FarmProject])
async def projects() -> list[FarmProject]:
    return list_farm_projects()


@app.post("/api/v1/projects", response_model=FarmProject, status_code=201)
async def create_project(payload: FarmProjectCreate) -> FarmProject:
    return save_farm_project(payload)


@app.get("/api/v1/projects/{project_id}", response_model=FarmProject)
async def project(project_id: str) -> FarmProject:
    saved_project = get_farm_project(project_id)
    if saved_project is None:
        raise HTTPException(status_code=404, detail="Farm project was not found.")
    return saved_project


@app.get("/api/v1/locations", response_model=list[LocationMatch])
async def locations(
    query: str = Query(min_length=2, max_length=100),
) -> list[LocationMatch]:
    try:
        return await provider.search_kenya(query.strip())
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Location provider request failed: {error}",
        ) from error


@app.get("/api/v1/resolve-map-link", response_model=MapLinkResolution)
async def resolve_map_link(
    link: str = Query(min_length=10, max_length=2048),
) -> MapLinkResolution:
    try:
        return await resolve_google_maps_link(link)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Google Maps link could not be resolved: {error}",
        ) from error
