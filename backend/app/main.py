from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError

from .crop_data import CROP_RULES
from .models import FarmReport, LocationMatch
from .providers.open_meteo import OpenMeteoProvider
from .service import create_farm_report

app = FastAPI(
    title="Planter API",
    version="0.1.0",
    description="Evidence-first farm intelligence for Kenya.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
    normalized_crop = crop.strip().lower()
    if normalized_crop not in CROP_RULES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported crop. Choose one of: {', '.join(CROP_RULES)}.",
        )
    try:
        return await create_farm_report(
            latitude, longitude, normalized_crop, provider
        )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Environmental provider request failed: {error}",
        ) from error


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
