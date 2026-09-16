from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["High", "Medium", "Low"]


class SourceRecord(BaseModel):
    provider: str
    kind: Literal["forecast", "historical", "modelled", "derived", "reference"]
    retrieved_at: datetime
    confidence: Confidence
    limitations: list[str] = Field(default_factory=list)


class CurrentWeather(BaseModel):
    temperature_c: float
    humidity_percent: float
    precipitation_mm: float
    wind_speed_kmh: float
    weather_code: int


class ClimateMonth(BaseModel):
    month: str
    rainfall_mm: float
    mean_temperature_c: float


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
    center_latitude: float = Field(ge=-4.9, le=5.0)
    center_longitude: float = Field(ge=33.5, le=42.1)
    boundary: list[Coordinate] = Field(min_length=3)
    sections: list[FarmSection] = Field(default_factory=list)


class FarmProject(FarmProjectCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class CropRuleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
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


class FarmReport(BaseModel):
    latitude: float
    longitude: float
    requested_crop: str
    crop_was_corrected: bool
    elevation_m: float | None
    current: CurrentWeather
    climate: list[ClimateMonth]
    outlook: list[OutlookSignal]
    crop: CropAssessment
    alternatives: list[CropAssessment]
    sources: list[SourceRecord]
    unavailable: list[UnavailableCapability]
