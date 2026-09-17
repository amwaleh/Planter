from statistics import mean

from .crop_data import CROP_RULES, CropRule
from .models import ClimateMonth, CropAssessment


def range_score(value: float, preferred: tuple[float, float], tolerance: float) -> int:
    low, high = preferred
    midpoint = (low + high) / 2
    half_range = max((high - low) / 2, 0.1)
    if low <= value <= high:
        distance_from_midpoint = abs(value - midpoint) / half_range
        return round(100 - 15 * distance_from_midpoint)
    distance = low - value if value < low else value - high
    return max(0, round(85 * (1 - distance / tolerance)))


def category_for(score: int) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 50:
        return "Marginal"
    return "Poor"


def assess_crop(
    crop_name: str,
    climate: list[ClimateMonth],
    elevation_m: float | None,
) -> CropAssessment:
    rule = CROP_RULES[crop_name]
    annual_mean_temperature = mean(month.mean_temperature_c for month in climate)
    annual_mean_monthly_rainfall = mean(month.rainfall_mm for month in climate)

    temperature = range_score(annual_mean_temperature, rule.temperature_range, 12)
    rainfall = range_score(
        annual_mean_monthly_rainfall,
        rule.preferred_monthly_rainfall,
        100,
    )
    elevation = (
        range_score(elevation_m, rule.elevation_range, 1200)
        if elevation_m is not None
        else None
    )

    components = {"temperature": temperature, "rainfall": rainfall}
    weights = {"temperature": 0.4, "rainfall": 0.4}
    if elevation is not None:
        components["elevation"] = elevation
        weights["temperature"] = 0.35
        weights["rainfall"] = 0.35
        weights["elevation"] = 0.3

    score = round(sum(components[name] * weights[name] for name in components))
    reasons = []
    if temperature >= 80:
        reasons.append(f"Typical temperatures are generally suitable for {rule.name}.")
    elif temperature >= 55:
        reasons.append(
            f"Temperatures may suit {rule.name} during part of the year, but hotter or cooler periods need attention."
        )
    else:
        reasons.append(
            f"Typical temperatures are often outside the preferred range for {rule.name}."
        )
    if rainfall >= 80:
        reasons.append(
            "The long-term rainfall amount is broadly suitable, although timing within the season still matters."
        )
    elif rainfall >= 55:
        reasons.append(
            "Rainfall may support the crop in the right season, but dry spells or supplemental irrigation need checking."
        )
    else:
        reasons.append(
            "The usual rainfall amount is a weak match, so a reliable water plan or another crop may be safer."
        )
    if elevation is not None:
        reasons.append(
            "The modelled elevation is within the crop's usual range."
            if elevation >= 80
            else "The farm elevation is near or outside the crop's usual range and needs local validation."
        )

    risks = list(rule.sensitivities)
    if rainfall < 70:
        risks.insert(0, "Historical rainfall fit is weak; irrigation or a different planting season may be needed.")
    if temperature < 70:
        risks.insert(0, "Typical temperatures fall outside the preferred range for part of the cycle.")

    evidence_count = len(components)
    confidence = "Medium" if evidence_count == 3 else "Low"
    confidence_explanation = (
        "Weather, long-term climate, and modelled elevation are available, but a farm soil test, slope, drainage, variety, and water-source check are still missing."
        if evidence_count == 3
        else "Weather and climate are available, but elevation and farm-level soil, drainage, variety, and water evidence are incomplete."
    )
    duration_midpoint = round(mean(rule.duration_days))

    return CropAssessment(
        crop=rule.name,
        score=score,
        category=category_for(score),
        confidence=confidence,
        reasons=reasons,
        risks=risks,
        component_scores=components,
        planting_guidance=rule.planting_guidance,
        harvest_guidance=f"Typically about {duration_midpoint} days after planting; variety and field conditions change this.",
        method="Weighted climate/elevation rule v0.2 with graded fit inside preferred ranges",
        confidence_explanation=confidence_explanation,
        what_to_verify=[
            "Laboratory or extension-supported soil test",
            "Field drainage and slope after rainfall",
            "Reliable water source through the crop cycle",
            "Locally recommended variety and maturity period",
            "County or KALRO planting guidance for the current season",
        ],
        regional_calendar_status="An authoritative coordinate-level planting calendar is not connected. Use the seasonal guidance only after confirmation with a local extension officer.",
    )


def rank_crops(
    selected_crop: str,
    climate: list[ClimateMonth],
    elevation_m: float | None,
) -> list[CropAssessment]:
    assessments = [
        assess_crop(name, climate, elevation_m)
        for name in CROP_RULES
        if name != selected_crop
    ]
    return sorted(assessments, key=lambda item: item.score, reverse=True)
