from .models import ClimateMonth, LivestockAssessment


def assess_livestock(
    climate: list[ClimateMonth],
    elevation_m: float | None,
) -> list[LivestockAssessment]:
    average_temperature = sum(month.mean_temperature_c for month in climate) / 12
    average_rainfall = sum(month.rainfall_mm for month in climate) / 12
    definitions = [
        ("Dairy cattle", (12, 26), (70, 180), "Heat stress and dependable water are major constraints."),
        ("Beef cattle", (16, 32), (35, 140), "Pasture condition and dry-season water must be verified."),
        ("Goats", (18, 35), (20, 110), "Browse availability and secure water still require local checks."),
        ("Sheep", (12, 30), (25, 120), "Wet conditions and parasite pressure can constrain production."),
        ("Poultry", (18, 30), (0, 250), "Housing, feed, ventilation, and drinking water matter more than rainfall alone."),
        ("Pigs", (16, 28), (0, 250), "Heat control, feed supply, water, and waste management are essential."),
        ("Rabbits", (12, 28), (0, 250), "Shade, ventilation, feed, and clean water must be planned."),
    ]
    assessments: list[LivestockAssessment] = []
    for name, temperature_range, rainfall_range, constraint in definitions:
        temperature_fit = temperature_range[0] <= average_temperature <= temperature_range[1]
        rainfall_fit = rainfall_range[0] <= average_rainfall <= rainfall_range[1]
        if temperature_fit and rainfall_fit:
            suitability = "Good"
        elif temperature_fit or rainfall_fit:
            suitability = "Possible with constraints"
        else:
            suitability = "Poor fit"
        assessments.append(
            LivestockAssessment(
                livestock=name,
                suitability=suitability,
                confidence="Low",
                reasons=[
                    f"Typical temperature is about {average_temperature:.1f} C.",
                    f"Average monthly rainfall is about {average_rainfall:.0f} mm.",
                ],
                constraints=[
                    constraint,
                    "Pasture, feed supply, animal breed, veterinary services, and farm-level water evidence are not yet available.",
                ],
            )
        )
    return assessments

