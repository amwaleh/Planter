from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError

from .crop_catalog import list_crop_catalog, resolve_catalog_name
from .crop_data import CROP_RULES, crop_display_name, resolve_crop_name
from .intelligence import (
    answer_farm_question,
    build_land_intelligence,
    build_livestock_report,
    build_water_intelligence,
)
from .map_links import resolve_google_maps_link
from .models import (
    AssistantRequest,
    AssistantResponse,
    CropRuleCreate,
    CropRuleRecord,
    CropCatalogItem,
    CropImageMetadata,
    FarmProject,
    FarmProjectCreate,
    FarmReport,
    LandIntelligence,
    LivestockReport,
    LocationMatch,
    MapLinkResolution,
    ProviderHealth,
    WaterIntelligence,
)
from .providers.location import NominatimLocationProvider
from .providers.open_meteo import OpenMeteoProvider
from .providers.water import OpenStreetMapWaterProvider
from .providers.wikimedia import WikimediaImageProvider
from .service import create_farm_report
from .storage import (
    get_farm_project,
    initialize_storage,
    list_crop_rules,
    list_farm_projects,
    save_crop_rule,
    save_farm_project,
    get_crop_image,
    save_crop_image,
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
location_provider = NominatimLocationProvider()
water_provider = OpenStreetMapWaterProvider()
image_provider = WikimediaImageProvider()


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
        catalog_item, catalog_suggestions = resolve_catalog_name(crop)
        if catalog_item is not None:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{catalog_item.name.title()} is in the East African crop catalog, "
                    "but its suitability rule is pending validated agronomic ranges and sources."
                ),
            )
        suggestions = suggestions or catalog_suggestions
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
            location_provider,
            requested_crop=crop.strip(),
            crop_was_corrected=was_corrected,
        )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Environmental provider request failed: {error}",
        ) from error


@app.get("/api/v1/provider-health", response_model=list[ProviderHealth])
async def provider_health() -> list[ProviderHealth]:
    return [provider.health()]


@app.get("/api/v1/land-intelligence", response_model=LandIntelligence)
async def land_intelligence(
    latitude: float = Query(ge=-4.9, le=5.0),
    longitude: float = Query(ge=33.5, le=42.1),
) -> LandIntelligence:
    try:
        weather = await provider.fetch(latitude, longitude)
        return build_land_intelligence(latitude, longitude, weather)
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Terrain provider request failed: {error}",
        ) from error


@app.get("/api/v1/water-intelligence", response_model=WaterIntelligence)
async def water_intelligence(
    latitude: float = Query(ge=-4.9, le=5.0),
    longitude: float = Query(ge=33.5, le=42.1),
) -> WaterIntelligence:
    try:
        weather = await provider.fetch(latitude, longitude)
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Weather provider request failed: {error}",
        ) from error
    try:
        nearest = await water_provider.nearest(latitude, longitude)
        surface_status = (
            "Nearest mapped feature found within 10 km."
            if nearest
            else "No mapped surface-water feature was found within 10 km."
        )
    except HTTPError as error:
        nearest = None
        surface_status = f"Surface-water map lookup failed: {error}"
    return build_water_intelligence(weather, nearest, surface_status)


@app.get("/api/v1/livestock", response_model=LivestockReport)
async def livestock(
    latitude: float = Query(ge=-4.9, le=5.0),
    longitude: float = Query(ge=33.5, le=42.1),
) -> LivestockReport:
    try:
        weather = await provider.fetch(latitude, longitude)
        return build_livestock_report(latitude, longitude, weather)
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Environmental provider request failed: {error}",
        ) from error


@app.post("/api/v1/assistant", response_model=AssistantResponse)
async def assistant(payload: AssistantRequest) -> AssistantResponse:
    normalized_crop, corrected, _ = resolve_crop_name(payload.crop)
    if normalized_crop is None:
        catalog_item, _ = resolve_catalog_name(payload.crop)
        crop_name = catalog_item.name if catalog_item else payload.crop.strip()
        return AssistantResponse(
            answer=(
                f"I cannot assess {crop_name} because Planter does not have a validated "
                "suitability rule for it. Choose a scorable crop or add a sourced rule in Crop Knowledge."
            ),
            citations=[],
            supported_intent="unsupported_crop",
            limitations=[
                "No other crop was substituted.",
                "Suitability is withheld until agronomic ranges and provenance are validated.",
            ],
        )
    try:
        report = await create_farm_report(
            payload.latitude,
            payload.longitude,
            normalized_crop,
            provider,
            location_provider,
            requested_crop=payload.crop,
            crop_was_corrected=corrected,
        )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Farm evidence could not be loaded: {error}",
        ) from error
    return answer_farm_question(payload.question, report)


@app.get("/api/v1/crops", response_model=list[str])
async def crops() -> list[str]:
    catalog_names = [item.name for item in list_crop_catalog()]
    rule_names = [crop_display_name(crop) for crop in CROP_RULES]
    return sorted(set(catalog_names + rule_names))


@app.get("/api/v1/crop-catalog", response_model=list[CropCatalogItem])
async def crop_catalog() -> list[CropCatalogItem]:
    return list_crop_catalog()


@app.get("/api/v1/crop-image", response_model=CropImageMetadata)
async def crop_image(
    name: str = Query(min_length=2, max_length=100),
    title: str = Query(min_length=2, max_length=160),
) -> CropImageMetadata:
    key = "_".join(title.strip().lower().replace("-", " ").split())
    cached = get_crop_image(key)
    if cached:
        return cached
    try:
        image = await image_provider.fetch(name.strip(), title.strip())
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail="Crop image provider request failed.",
        ) from error
    if image is None:
        raise HTTPException(status_code=404, detail="No reusable crop image was found.")
    return save_crop_image(key, image)


@app.get("/api/v1/crop-rules", response_model=list[CropRuleRecord])
async def crop_rules() -> list[CropRuleRecord]:
    return list_crop_rules()


@app.post("/api/v1/crop-rules", response_model=CropRuleRecord, status_code=201)
async def create_crop_rule(payload: CropRuleCreate) -> CropRuleRecord:
    image_fields = [
        payload.image_url,
        payload.image_source_page_url,
        payload.image_creator,
        payload.image_license,
        payload.image_alt_text,
    ]
    if any(image_fields) and not all(image_fields):
        raise HTTPException(
            status_code=400,
            detail=(
                "Custom image metadata requires image URL, source page, creator, "
                "license, and alt text."
            ),
        )
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
