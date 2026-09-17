from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

from .region import (
    EAST_AFRICA_LATITUDE_MAX,
    EAST_AFRICA_LATITUDE_MIN,
    EAST_AFRICA_LONGITUDE_MAX,
    EAST_AFRICA_LONGITUDE_MIN,
)

Confidence = Literal["High", "Medium", "Low"]


class SourceRecord(BaseModel):
    provider: str
    kind: Literal["forecast", "historical", "modelled", "derived", "reference"]
    retrieved_at: datetime
    confidence: Confidence
    resolution: str | None = None
    limitations: list[str] = Field(default_factory=list)
    stale: bool = False
    age_seconds: int = 0


class CurrentWeather(BaseModel):
    temperature_c: float
    humidity_percent: float
    precipitation_mm: float
    wind_speed_kmh: float
    weather_code: int
    observed_at: datetime
    retrieved_at: datetime
    precipitation_meaning: str


class ClimateMonth(BaseModel):
    month: str
    rainfall_mm: float
    mean_temperature_c: float
    current_year_rainfall_mm: float | None = None
    current_year_complete: bool = True


class RecentDay(BaseModel):
    date: str
    rainfall_mm: float
    temperature_min_c: float
    temperature_max_c: float
    humidity_percent: float | None = None


class RecentConditions(BaseModel):
    days: list[RecentDay]
    classification: Literal["Dry", "Moderately moist", "Wet", "Very wet"]
    total_rainfall_mm: float
    rainy_days: int
    average_humidity_percent: float | None
    explanation: str
    confidence: Confidence
    method: str


class RainfallComparison(BaseModel):
    completed_months: int
    current_year_total_mm: float
    expected_total_mm: float
    difference_mm: float
    difference_percent: float | None
    summary: str


class EnsoProbability(BaseModel):
    season: str
    la_nina_percent: int
    neutral_percent: int
    el_nino_percent: int


class EnsoObservation(BaseModel):
    season: str
    year: int
    anomaly_c: float


class EnsoTracker(BaseModel):
    status: Literal["Available", "Unavailable"]
    outlook_phase: Literal["El Niño", "Neutral", "La Niña", "Unavailable"]
    observed_phase: Literal["El Niño signal", "Neutral signal", "La Niña signal", "Unavailable"]
    issued: str | None = None
    retrieved_at: datetime
    latest_observation: EnsoObservation | None = None
    observations: list[EnsoObservation] = Field(default_factory=list)
    probabilities: list[EnsoProbability] = Field(default_factory=list)
    eastern_africa_context: str
    confidence: Confidence
    source: str
    source_url: HttpUrl
    regional_source: str
    regional_source_url: HttpUrl
    stale: bool = False
    limitations: list[str] = Field(default_factory=list)


class LocationContext(BaseModel):
    display_name: str
    place: str | None = None
    ward_or_suburb: str | None = None
    subcounty: str | None = None
    county: str | None = None
    source: str
    retrieved_at: datetime
    limitations: list[str] = Field(default_factory=list)


class OutlookSignal(BaseModel):
    label: str
    level: Literal["Favourable", "Watch", "Elevated"]
    detail: str
    confidence: Confidence


class CropAssessment(BaseModel):
    crop: str
    score: int
    category: Literal["Excellent", "Good", "Marginal", "Poor"]
    confidence: Confidence
    reasons: list[str]
    risks: list[str]
    component_scores: dict[str, int]
    planting_guidance: str
    harvest_guidance: str
    method: str
    confidence_explanation: str
    what_to_verify: list[str]
    regional_calendar_status: str


class UnavailableCapability(BaseModel):
    capability: str
    reason: str


class LocationMatch(BaseModel):
    name: str
    admin1: str | None = None
    admin2: str | None = None
    latitude: float
    longitude: float


class MapLinkResolution(BaseModel):
    latitude: float
    longitude: float
    resolved_url: str


class SurfaceWaterFeature(BaseModel):
    name: str
    kind: str
    latitude: float
    longitude: float
    distance_km: float
    source: str
    limitations: list[str]


class WaterIntelligence(BaseModel):
    recent_rainfall_mm: float
    recent_moisture_classification: str
    current_year_rainfall_mm: float
    expected_rainfall_mm: float
    forecast_et0_mm: float | None = None
    soil_moisture_status: str
    elevation_m: float | None = None
    terrain_status: str
    irrigation_signal: Literal["Likely needed", "Monitor", "Not indicated by recent weather"]
    irrigation_explanation: str
    nearest_surface_water: SurfaceWaterFeature | None = None
    surface_water_status: str
    groundwater_status: str
    piped_water_status: str
    retrieved_at: datetime
    sources: list[SourceRecord]


class SoilIntelligence(BaseModel):
    status: Literal["Available", "Unavailable"]
    properties: dict[str, float | str | None]
    interpretation: str
    soil_test_checklist: list[str]
    source: str | None = None
    limitations: list[str]


class TerrainIntelligence(BaseModel):
    elevation_m: float | None
    slope_percent: float | None
    terrain_class: str
    drainage_interpretation: str
    erosion_risk: str
    mechanization_note: str
    confidence: Confidence
    limitations: list[str]


class LandIntelligence(BaseModel):
    latitude: float
    longitude: float
    soil: SoilIntelligence
    terrain: TerrainIntelligence


class LivestockAssessment(BaseModel):
    livestock: str
    suitability: Literal["Good", "Possible with constraints", "Poor fit"]
    confidence: Confidence
    reasons: list[str]
    constraints: list[str]


class LivestockReport(BaseModel):
    latitude: float
    longitude: float
    assessments: list[LivestockAssessment]
    evidence_note: str


class AssistantRequest(BaseModel):
    latitude: float = Field(
        ge=EAST_AFRICA_LATITUDE_MIN,
        le=EAST_AFRICA_LATITUDE_MAX,
    )
    longitude: float = Field(
        ge=EAST_AFRICA_LONGITUDE_MIN,
        le=EAST_AFRICA_LONGITUDE_MAX,
    )
    question: str = Field(min_length=3, max_length=500)
    crop: str = Field(default="maize", max_length=100)


class AssistantResponse(BaseModel):
    answer: str
    citations: list[str]
    supported_intent: str
    limitations: list[str]


class ProviderHealth(BaseModel):
    provider: str
    status: Literal["Healthy", "Degraded", "Unknown"]
    cache_entries: int
    cache_hits: int
    last_success_at: datetime | None = None
    last_latency_ms: int | None = None
    last_error: str | None = None


class Coordinate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class FarmSection(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    activity: str = Field(min_length=1, max_length=200)
    crop: str | None = Field(default=None, max_length=100)
    boundary: list[Coordinate] = Field(min_length=3)


class FarmProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    center_latitude: float = Field(
        ge=EAST_AFRICA_LATITUDE_MIN,
        le=EAST_AFRICA_LATITUDE_MAX,
    )
    center_longitude: float = Field(
        ge=EAST_AFRICA_LONGITUDE_MIN,
        le=EAST_AFRICA_LONGITUDE_MAX,
    )
    boundary: list[Coordinate] = Field(min_length=3)
    sections: list[FarmSection] = Field(default_factory=list)


class FarmProject(FarmProjectCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class CropRuleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    category: Literal["fruits", "vegetables", "other"] = "other"
    wikipedia_title: str | None = Field(default=None, max_length=160)
    image_url: HttpUrl | None = None
    image_source_page_url: HttpUrl | None = None
    image_creator: str | None = Field(default=None, max_length=300)
    image_license: str | None = Field(default=None, max_length=100)
    image_license_url: HttpUrl | None = None
    image_alt_text: str | None = Field(default=None, max_length=300)
    temperature_min_c: float = Field(ge=-10, le=50)
    temperature_max_c: float = Field(ge=-10, le=55)
    monthly_rainfall_min_mm: float = Field(ge=0, le=1000)
    monthly_rainfall_max_mm: float = Field(ge=0, le=1500)
    elevation_min_m: float = Field(ge=-500, le=6000)
    elevation_max_m: float = Field(ge=-500, le=6000)
    duration_min_days: int = Field(ge=1, le=3650)
    duration_max_days: int = Field(ge=1, le=3650)
    planting_guidance: str = Field(min_length=10, max_length=1000)
    sensitivities: list[str] = Field(min_length=1, max_length=10)
    source: str = Field(min_length=3, max_length=300)


class CropRuleRecord(CropRuleCreate):
    key: str
    custom: bool


class CropImageMetadata(BaseModel):
    crop_name: str
    image_url: HttpUrl
    source_page_url: HttpUrl
    creator: str
    license: str
    license_url: HttpUrl | None = None
    alt_text: str
    retrieved_at: datetime


class CropCatalogItem(BaseModel):
    name: str
    category: Literal["fruits", "vegetables", "other"]
    aliases: list[str]
    region: str
    rule_status: Literal["Validated prototype rule", "Rule pending validation"]
    wikipedia_title: str
    source_notes: list[str]
    image: CropImageMetadata | None = None


class FarmReport(BaseModel):
    latitude: float
    longitude: float
    requested_crop: str
    crop_was_corrected: bool
    location: LocationContext
    elevation_m: float | None
    current: CurrentWeather
    recent: RecentConditions
    climate: list[ClimateMonth]
    rainfall_comparison: RainfallComparison
    outlook: list[OutlookSignal]
    crop: CropAssessment
    alternatives: list[CropAssessment]
    sources: list[SourceRecord]
    unavailable: list[UnavailableCapability]
