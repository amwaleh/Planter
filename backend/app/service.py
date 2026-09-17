import asyncio
from datetime import date, datetime, timezone
from statistics import mean

import httpx

from .models import (
    FarmReport,
    LocationContext,
    OutlookSignal,
    RainfallComparison,
    RecentConditions,
    RecentDay,
    SourceRecord,
    UnavailableCapability,
)
from .providers.location import NominatimLocationProvider
from .providers.open_meteo import OpenMeteoProvider
from .providers.crop_knowledge import (
    CropKnowledgeProvider,
    UnavailableRegionalCalendarProvider,
)
from .scoring import assess_crop, rank_crops


def build_outlook(daily: dict[str, list[float]]) -> list[OutlookSignal]:
    rainfall = [value or 0 for value in daily["precipitation_sum"]]
    temperatures = [
        mean([maximum, minimum])
        for maximum, minimum in zip(
            daily["temperature_2m_max"],
            daily["temperature_2m_min"],
            strict=True,
        )
        if maximum is not None and minimum is not None
    ]
    total_rainfall = sum(rainfall)
    hottest_day = max(temperatures)
    wet_days = sum(value >= 5 for value in rainfall)

    rainfall_level = "Favourable" if 25 <= total_rainfall <= 100 else "Watch"
    heat_level = "Elevated" if hottest_day >= 32 else "Favourable"
    operations_level = "Watch" if wet_days >= 6 else "Favourable"

    return [
        OutlookSignal(
            label="Rainfall tendency",
            level=rainfall_level,
            detail=f"The available {len(rainfall)}-day numerical forecast totals {total_rainfall:.0f} mm. Days beyond this horizon require seasonal context, not deterministic claims.",
            confidence="Medium",
        ),
        OutlookSignal(
            label="Heat stress",
            level=heat_level,
            detail=f"The highest daily mean temperature in the available forecast is about {hottest_day:.1f} C.",
            confidence="Medium",
        ),
        OutlookSignal(
            label="Field operations",
            level=operations_level,
            detail=f"{wet_days} forecast days have at least 5 mm of rain; confirm short-range conditions before spraying or field work.",
            confidence="Low",
        ),
    ]


def classify_recent_conditions(days: list[RecentDay]) -> RecentConditions:
    total_rainfall = sum(day.rainfall_mm for day in days)
    rainy_days = sum(day.rainfall_mm >= 1 for day in days)
    humidity_values = [
        day.humidity_percent for day in days if day.humidity_percent is not None
    ]
    average_humidity = mean(humidity_values) if humidity_values else None
    humidity_component = max(0, (average_humidity or 60) - 60) * 1.5
    moisture_index = total_rainfall + rainy_days * 3 + humidity_component
    if moisture_index < 25:
        classification = "Dry"
    elif moisture_index < 70:
        classification = "Moderately moist"
    elif moisture_index < 140:
        classification = "Wet"
    else:
        classification = "Very wet"
    humidity_text = (
        f" and average humidity was {average_humidity:.0f}%"
        if average_humidity is not None
        else ""
    )
    return RecentConditions(
        days=days,
        classification=classification,
        total_rainfall_mm=round(total_rainfall, 1),
        rainy_days=rainy_days,
        average_humidity_percent=(
            round(average_humidity, 1) if average_humidity is not None else None
        ),
        explanation=(
            f"The previous {len(days)} completed days received {total_rainfall:.1f} mm "
            f"across {rainy_days} rainy days{humidity_text}."
        ),
        confidence="Medium" if average_humidity is not None else "Low",
        method="Moisture index = rainfall total + 3 x rainy days + 1.5 x humidity above 60%.",
    )


def compare_rainfall(climate: list) -> RainfallComparison:
    complete = [
        month
        for month in climate
        if month.current_year_complete and month.current_year_rainfall_mm is not None
    ]
    current_total = sum(month.current_year_rainfall_mm or 0 for month in complete)
    expected_total = sum(month.rainfall_mm for month in complete)
    difference = current_total - expected_total
    percent = (difference / expected_total * 100) if expected_total else None
    direction = "above" if difference > 0 else "below"
    if abs(difference) < 1:
        summary = "Completed months are close to the long-term expected rainfall."
    else:
        percentage_text = f" ({abs(percent):.0f}%)" if percent is not None else ""
        summary = (
            f"Rainfall across {len(complete)} completed months is about "
            f"{abs(difference):.0f} mm{percentage_text} {direction} the ten-year average."
        )
    return RainfallComparison(
        completed_months=len(complete),
        current_year_total_mm=round(current_total, 1),
        expected_total_mm=round(expected_total, 1),
        difference_mm=round(difference, 1),
        difference_percent=round(percent, 1) if percent is not None else None,
        summary=summary,
    )


async def create_farm_report(
    latitude: float,
    longitude: float,
    crop: str | None,
    provider: OpenMeteoProvider,
    location_provider: NominatimLocationProvider,
    requested_crop: str | None = None,
    crop_was_corrected: bool = False,
    crop_knowledge_provider: CropKnowledgeProvider | None = None,
) -> FarmReport:
    weather_task = provider.fetch(latitude, longitude)
    location_task = location_provider.reverse(latitude, longitude)
    weather, location_result = await asyncio.gather(
        weather_task,
        location_task,
        return_exceptions=True,
    )
    if isinstance(weather, BaseException):
        raise weather
    if isinstance(location_result, BaseException):
        location = LocationContext(
            display_name=f"{latitude:.4f}, {longitude:.4f}",
            source="Coordinates",
            retrieved_at=datetime.now(timezone.utc),
            limitations=[
                "The place-name provider was unavailable; coordinates remain accurate."
            ],
        )
    else:
        location = location_result

    recent = classify_recent_conditions(weather.recent_days)
    recommendation_mode = crop is None
    if recommendation_mode:
        ranked_crops = rank_crops("", weather.climate, weather.elevation_m)
        crop_assessment = ranked_crops[0]
        alternatives = ranked_crops[1:4]
    else:
        crop_assessment = assess_crop(crop, weather.climate, weather.elevation_m)
        alternatives = rank_crops(
            crop,
            weather.climate,
            weather.elevation_m,
        )[:3]
    crop_assessment.regional_calendar_status = (
        crop_knowledge_provider or UnavailableRegionalCalendarProvider()
    ).calendar_status(crop_assessment.crop, location)
    sources = weather.sources + [
        SourceRecord(
            provider=location.source,
            kind="reference",
            retrieved_at=location.retrieved_at,
            confidence="Medium",
            resolution="Nearest available OpenStreetMap administrative/place context.",
            limitations=location.limitations,
        ),
        SourceRecord(
            provider="Planter suitability rules v0.1",
            kind="derived",
            retrieved_at=weather.sources[0].retrieved_at,
            confidence=crop_assessment.confidence,
            resolution="Farm-coordinate assessment from the listed climate and elevation inputs.",
            limitations=[
                "The recommendation currently uses climate and elevation.",
                "A farm soil test, slope, cultivar, pests, management, and authoritative county calendar are still needed.",
            ],
        ),
    ]
    return FarmReport(
        latitude=latitude,
        longitude=longitude,
        requested_crop=requested_crop or crop or "Best crop for this location",
        crop_was_corrected=crop_was_corrected,
        recommendation_mode=recommendation_mode,
        location=location,
        elevation_m=weather.elevation_m,
        current=weather.current,
        recent=recent,
        climate=weather.climate,
        rainfall_comparison=compare_rainfall(weather.climate),
        outlook=build_outlook(weather.forecast_daily),
        crop=crop_assessment,
        alternatives=alternatives,
        sources=sources,
        unavailable=[
            UnavailableCapability(
                capability="Farm soil profile",
                reason="No validated soil provider is connected. Use a laboratory or extension-supported soil test before fertilizer or amendment decisions.",
            ),
            UnavailableCapability(
                capability="Groundwater depth",
                reason="No authoritative coordinate-level borehole or hydrogeological source is connected. A licensed hydrogeological survey is required before drilling.",
            ),
            UnavailableCapability(
                capability="County planting calendar",
                reason="An authoritative local calendar is not connected. Confirm the season and variety with KALRO or a county extension officer.",
            ),
        ],
    )
