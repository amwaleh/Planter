from statistics import mean

from .crop_data import CROP_RULES, CropRule
from .models import ClimateMonth, CropAssessment


def range_score(value: float, preferred: tuple[float, float], tolerance: float) -> int:
    low, high = preferred
    if low <= value <= high:
        return 100
    distance = low - value if value < low else value - high
    return max(0, round(100 * (1 - distance / tolerance)))


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
    reasons = [
        f"Long-term mean temperature scores {temperature}/100 against the documented crop range.",
        f"Mean monthly rainfall scores {rainfall}/100; seasonal distribution still matters.",
    ]
    if elevation is not None:
        reasons.append(
            f"Modelled elevation scores {elevation}/100 against the crop elevation range."
        )

    risks = list(rule.sensitivities)
    if rainfall < 70:
        risks.insert(0, "Historical rainfall fit is weak; irrigation or a different planting season may be needed.")
    if temperature < 70:
        risks.insert(0, "Typical temperatures fall outside the preferred range for part of the cycle.")

    evidence_count = len(components)
    confidence = "Medium" if evidence_count == 3 else "Low"
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
        method="Weighted climate/elevation rule v0.1",
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

