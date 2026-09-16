from app.crop_data import CROP_RULES, resolve_crop_name
from app.models import ClimateMonth
from app.scoring import assess_crop, category_for, range_score


def climate(rainfall: float = 70, temperature: float = 23) -> list[ClimateMonth]:
    return [
        ClimateMonth(
            month=month,
            rainfall_mm=rainfall,
            mean_temperature_c=temperature,
        )
        for month in (
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        )
    ]


def test_range_score_rewards_preferred_values() -> None:
    assert range_score(20, (15, 25), 10) == 100
    assert range_score(10, (15, 25), 10) == 50
    assert range_score(0, (15, 25), 10) == 0


def test_category_boundaries() -> None:
    assert category_for(85) == "Excellent"
    assert category_for(70) == "Good"
    assert category_for(50) == "Marginal"
    assert category_for(49) == "Poor"


def test_assessment_is_explainable() -> None:
    assessment = assess_crop("onion", climate(), 1800)
    assert assessment.score >= 70
    assert assessment.confidence == "Medium"
    assert set(assessment.component_scores) == {"temperature", "rainfall", "elevation"}
    assert assessment.reasons
    assert assessment.risks


def test_missing_elevation_reduces_confidence() -> None:
    assessment = assess_crop("beans", climate(), None)
    assert assessment.confidence == "Low"
    assert "elevation" not in assessment.component_scores


def test_crop_catalog_contains_broad_kenyan_selection() -> None:
    assert len(CROP_RULES) >= 20
    assert {"maize", "cassava", "coffee", "tea", "green_gram"} <= set(CROP_RULES)
    assert resolve_crop_name("pineapples")[:2] == ("pineapple", True)


def test_crop_name_autocorrects_spelling_and_aliases() -> None:
    assert resolve_crop_name("tomatos")[:2] == ("tomato", True)
    assert resolve_crop_name("green grams")[:2] == ("green_gram", True)
    assert resolve_crop_name("potato")[:2] == ("potato", False)


def test_unknown_crop_is_not_invented() -> None:
    crop, corrected, suggestions = resolve_crop_name("dragon fruit")
    assert crop is None
    assert corrected is False
    assert suggestions == []
