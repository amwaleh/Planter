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
