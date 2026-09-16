from datetime import datetime, timezone

from .livestock import assess_livestock
from .models import (
    AssistantResponse,
    LandIntelligence,
    LivestockReport,
    SourceRecord,
    WaterIntelligence,
)
from .providers.land import (
    ModelledElevationTerrainProvider,
    SoilProvider,
    TerrainProvider,
    UnavailableSoilProvider,
)
from .providers.open_meteo import OpenMeteoData
from .service import classify_recent_conditions, compare_rainfall


def build_land_intelligence(
    latitude: float,
    longitude: float,
    elevation_m: float | None,
    soil_provider: SoilProvider | None = None,
    terrain_provider: TerrainProvider | None = None,
) -> LandIntelligence:
    soil = (soil_provider or UnavailableSoilProvider()).profile(latitude, longitude)
    terrain = (terrain_provider or ModelledElevationTerrainProvider()).profile(
        latitude,
        longitude,
        elevation_m,
    )
    return LandIntelligence(
        latitude=latitude,
        longitude=longitude,
        soil=soil,
        terrain=terrain,
    )


def build_water_intelligence(
    weather: OpenMeteoData,
    nearest_surface_water,
    surface_status: str,
) -> WaterIntelligence:
    recent = classify_recent_conditions(weather.recent_days)
    rainfall_comparison = compare_rainfall(weather.climate)
    et0_values = weather.forecast_daily.get("et0_fao_evapotranspiration", [])
    forecast_et0 = sum(value or 0 for value in et0_values) if et0_values else None
    if recent.classification == "Dry":
        irrigation_signal = "Likely needed"
        explanation = (
            "Recent conditions are dry. Check crop stage, root-zone moisture, and a reliable "
            "water source before irrigating."
        )
    elif recent.classification == "Moderately moist":
        irrigation_signal = "Monitor"
        explanation = (
            "Recent moisture is moderate. Inspect the root zone and short-range forecast "
            "before deciding to irrigate."
        )
    else:
        irrigation_signal = "Not indicated by recent weather"
        explanation = (
            "Recent rainfall does not by itself indicate an immediate irrigation need. "
            "Field drainage and crop stage still matter."
        )
    return WaterIntelligence(
        recent_rainfall_mm=recent.total_rainfall_mm,
        recent_moisture_classification=recent.classification,
        current_year_rainfall_mm=rainfall_comparison.current_year_total_mm,
        expected_rainfall_mm=rainfall_comparison.expected_total_mm,
        forecast_et0_mm=round(forecast_et0, 1) if forecast_et0 is not None else None,
        soil_moisture_status=(
            "A validated root-zone soil-moisture provider is not connected. "
            "Check moisture directly in each planned farm section."
        ),
        elevation_m=weather.elevation_m,
        terrain_status=(
            "Elevation is modelled. Slope, runoff direction, drainage, and waterlogging "
            "risk require terrain or field-survey evidence."
        ),
        irrigation_signal=irrigation_signal,
        irrigation_explanation=explanation,
        nearest_surface_water=nearest_surface_water,
        surface_water_status=surface_status,
        groundwater_status=(
            "Reliable borehole depth and aquifer evidence are unavailable. "
            "A licensed hydrogeological survey is required before drilling."
        ),
        piped_water_status=(
            "No authoritative utility or area-service dataset is connected. "
            "Nearby development does not confirm a piped-water connection."
        ),
        retrieved_at=datetime.now(timezone.utc),
        sources=[
            *weather.sources,
            SourceRecord(
                provider="OpenStreetMap contributors",
                kind="reference",
                retrieved_at=datetime.now(timezone.utc),
                confidence="Low",
                resolution="Mapped water features within a 10 km search radius.",
                limitations=[
                    "Coverage depends on volunteer-maintained map data.",
                    "A mapped feature does not prove access, quality, flow, or reliability.",
                ],
            ),
        ],
    )


def build_livestock_report(
    latitude: float,
    longitude: float,
    weather: OpenMeteoData,
) -> LivestockReport:
    return LivestockReport(
        latitude=latitude,
        longitude=longitude,
        assessments=assess_livestock(weather.climate, weather.elevation_m),
        evidence_note=(
            "This first-pass assessment uses long-term temperature and rainfall. "
            "Pasture, feed, breed, water, veterinary access, and local production systems "
            "must be checked before investing."
        ),
    )


def answer_farm_question(question: str, report) -> AssistantResponse:
    normalized = question.lower()
    citations = [source.provider for source in report.sources[:3]]
    limitations = [
        "The assistant explains the structured farm evidence; it does not create new measurements.",
        "Farm-level soil, groundwater, and authoritative local planting-calendar evidence are incomplete.",
    ]
    if any(word in normalized for word in ("rain", "dry", "wet", "moisture")):
        return AssistantResponse(
            answer=(
                f"The previous 21 completed days are classified as "
                f"{report.recent.classification.lower()}. "
                f"{report.recent.explanation} This describes recent conditions, not the forecast."
            ),
            citations=citations,
            supported_intent="recent_conditions",
            limitations=limitations,
        )
    if any(word in normalized for word in ("irrigat", "water", "borehole")):
        signal = (
            "Recent dryness suggests checking root-zone moisture and irrigation access."
            if report.recent.classification == "Dry"
            else "Recent weather alone does not prove that irrigation is required."
        )
        return AssistantResponse(
            answer=(
                f"{signal} Groundwater depth and borehole viability are unavailable, "
                "so a hydrogeological survey is required before drilling."
            ),
            citations=citations,
            supported_intent="water",
            limitations=limitations,
        )
    if any(word in normalized for word in ("grow", "crop", report.crop.crop.lower())):
        return AssistantResponse(
            answer=(
                f"{report.crop.crop.title()} is a {report.crop.category.lower()} candidate "
                f"for this location. {report.crop.reasons[0]} "
                f"The main caution is: {report.crop.risks[0]}"
            ),
            citations=citations,
            supported_intent="crop_suitability",
            limitations=limitations,
        )
    if any(word in normalized for word in ("source", "evidence", "confidence")):
        return AssistantResponse(
            answer=(
                f"The recommendation uses {', '.join(citations)}. "
                f"Confidence is {report.crop.confidence.lower()} because "
                f"{report.crop.confidence_explanation.lower()}"
            ),
            citations=citations,
            supported_intent="evidence",
            limitations=limitations,
        )
    return AssistantResponse(
        answer=(
            "I cannot answer that question from the current evidence package. "
            "Ask about crop suitability, recent rain, irrigation, water limitations, or sources."
        ),
        citations=[],
        supported_intent="unsupported",
        limitations=limitations,
    )
