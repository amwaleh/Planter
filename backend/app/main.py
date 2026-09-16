from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError

from .crop_data import CROP_RULES, crop_display_name, resolve_crop_name
from .map_links import resolve_google_maps_link
from .models import FarmReport, LocationMatch, MapLinkResolution
from .providers.open_meteo import OpenMeteoProvider
from .service import create_farm_report

app = FastAPI(
    title="Planter API",
    version="0.1.0",
    description="Evidence-first farm intelligence for Kenya.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET"],
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
