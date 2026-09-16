from statistics import mean

from .models import FarmReport, OutlookSignal, SourceRecord, UnavailableCapability
from .providers.open_meteo import OpenMeteoProvider
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


async def create_farm_report(
    latitude: float,
    longitude: float,
    crop: str,
    provider: OpenMeteoProvider,
) -> FarmReport:
    current, climate, elevation, daily, provider_sources = await provider.fetch(
        latitude, longitude
    )
    crop_assessment = assess_crop(crop, climate, elevation)
    sources = provider_sources + [
        SourceRecord(
            provider="Planter suitability rules v0.1",
            kind="derived",
            retrieved_at=provider_sources[0].retrieved_at,
            confidence=crop_assessment.confidence,
            limitations=[
                "Prototype rules use climate and elevation only.",
                "Soil, slope, cultivar, pests, management, and authoritative county planting calendars are not yet included.",
            ],
        )
    ]
    return FarmReport(
        latitude=latitude,
        longitude=longitude,
        elevation_m=elevation,
        current=current,
        climate=climate,
        outlook=build_outlook(daily),
        crop=crop_assessment,
        alternatives=rank_crops(crop, climate, elevation)[:3],
        sources=sources,
        unavailable=[
            UnavailableCapability(
                capability="Soil profile",
                reason="A stable licensed soil provider has not yet been connected; no soil values are inferred.",
            ),
            UnavailableCapability(
                capability="Groundwater depth",
                reason="No authoritative coordinate-level borehole or hydrogeological source is connected.",
            ),
            UnavailableCapability(
                capability="County planting calendar",
                reason="Kenya-specific authoritative agronomic guidance is pending provider validation.",
            ),
        ],
    )

