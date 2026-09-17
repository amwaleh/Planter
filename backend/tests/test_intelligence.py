from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.crop_catalog import list_crop_catalog, resolve_catalog_name
from app.intelligence import answer_farm_question, build_land_intelligence
from app.livestock import assess_livestock
from app.models import ClimateMonth, CurrentWeather, RecentDay, SourceRecord
from app.providers.land import SoilGridsSoilProvider
from app.providers.enso import EnsoProvider
from app.providers.open_meteo import CacheEntry, OpenMeteoData, OpenMeteoProvider
from app.providers.water import _distance_km
from app.service import classify_recent_conditions, compare_rainfall, create_farm_report


def recent_days(rainfall: float, humidity: float = 60) -> list[RecentDay]:
    today = date.today()
    return [
        RecentDay(
            date=(today - timedelta(days=index + 1)).isoformat(),
            rainfall_mm=rainfall,
            temperature_min_c=18,
            temperature_max_c=28,
            humidity_percent=humidity,
        )
        for index in range(21)
    ]


def weather_data() -> OpenMeteoData:
    retrieved_at = datetime.now(timezone.utc)
    return OpenMeteoData(
        current=CurrentWeather(
            temperature_c=24,
            humidity_percent=65,
            precipitation_mm=0,
            wind_speed_kmh=8,
            weather_code=1,
            observed_at=retrieved_at,
            retrieved_at=retrieved_at,
            precipitation_meaning="Current provider interval.",
        ),
        climate=[
            ClimateMonth(
                month=str(month),
                rainfall_mm=80,
                mean_temperature_c=24,
                current_year_rainfall_mm=70,
                current_year_complete=True,
            )
            for month in range(1, 13)
        ],
        elevation_m=1600,
        forecast_daily={
            "precipitation_sum": [2.0] * 16,
            "temperature_2m_max": [28.0] * 16,
            "temperature_2m_min": [18.0] * 16,
        },
        recent_days=recent_days(1),
        sources=[
            SourceRecord(
                provider="Test weather",
                kind="historical",
                retrieved_at=retrieved_at,
                confidence="Medium",
            )
        ],
    )


def test_recent_conditions_classify_dry_and_wet_periods() -> None:
    assert classify_recent_conditions(recent_days(0)).classification == "Dry"
    assert classify_recent_conditions(recent_days(8, 80)).classification == "Very wet"


@pytest.mark.parametrize(
    ("daily_rainfall", "humidity", "expected"),
    [
        (0.5, 75, "Moderately moist"),
        (1.0, 60, "Wet"),
    ],
)
def test_recent_conditions_classification_boundaries(
    daily_rainfall: float,
    humidity: float,
    expected: str,
) -> None:
    assert (
        classify_recent_conditions(recent_days(daily_rainfall, humidity)).classification
        == expected
    )


def test_rainfall_comparison_uses_only_complete_current_months() -> None:
    climate = [
        ClimateMonth(
            month="Jan",
            rainfall_mm=100,
            mean_temperature_c=22,
            current_year_rainfall_mm=80,
            current_year_complete=True,
        ),
        ClimateMonth(
            month="Feb",
            rainfall_mm=100,
            mean_temperature_c=22,
            current_year_rainfall_mm=50,
            current_year_complete=False,
        ),
    ]
    comparison = compare_rainfall(climate)
    assert comparison.completed_months == 1
    assert comparison.difference_mm == -20
    assert comparison.difference_percent == -20


@pytest.mark.asyncio
async def test_provider_cache_reuses_coordinate_response() -> None:
    provider = OpenMeteoProvider()
    fetch_fresh = AsyncMock(return_value="cached-data")
    setattr(provider, "_fetch_fresh", fetch_fresh)
    first = await provider.fetch(-1.2864, 36.8172)
    second = await provider.fetch(-1.2864, 36.8172)
    assert first == second
    assert fetch_fresh.await_count == 1
    assert provider.health().cache_hits == 1


@pytest.mark.asyncio
async def test_expired_cache_is_returned_as_stale_when_refresh_fails() -> None:
    provider = OpenMeteoProvider(ttl_minutes=1)
    cached = weather_data()
    provider._cache[(-1.2864, 36.8172)] = CacheEntry(
        stored_at=datetime.now(timezone.utc) - timedelta(minutes=2),
        data=cached,
    )
    setattr(
        provider,
        "_fetch_fresh",
        AsyncMock(side_effect=httpx.ReadTimeout("provider timed out")),
    )

    result = await provider.fetch(-1.2864, 36.8172)

    assert result is cached
    assert result.sources[0].stale is True
    assert result.sources[0].age_seconds >= 120
    assert provider.health().status == "Degraded"
    assert "latitude" not in (provider.health().last_error or "")


@pytest.mark.asyncio
async def test_report_falls_back_to_coordinates_when_location_lookup_fails() -> None:
    weather_provider = SimpleNamespace(fetch=AsyncMock(return_value=weather_data()))
    location_provider = SimpleNamespace(
        reverse=AsyncMock(side_effect=httpx.ReadTimeout("location timed out"))
    )

    report = await create_farm_report(
        -1.2864,
        36.8172,
        "maize",
        weather_provider,
        location_provider,
    )

    assert report.location.display_name == "-1.2864, 36.8172"
    assert report.location.source == "Coordinates"


@pytest.mark.asyncio
async def test_report_recommends_highest_scoring_crop_when_none_is_selected() -> None:
    weather_provider = SimpleNamespace(fetch=AsyncMock(return_value=weather_data()))
    location_provider = SimpleNamespace(
        reverse=AsyncMock(side_effect=httpx.ReadTimeout("location timed out"))
    )

    report = await create_farm_report(
        -1.2864,
        36.8172,
        None,
        weather_provider,
        location_provider,
    )

    assert report.recommendation_mode is True
    assert all(report.crop.score >= crop.score for crop in report.alternatives)
    assert report.requested_crop == "Best crop for this location"


def test_surface_water_distance_uses_great_circle_distance() -> None:
    assert _distance_km(0, 0, 1, 0) == pytest.approx(111.2, rel=0.01)


def test_land_intelligence_remains_available_without_elevation() -> None:
    report = build_land_intelligence(-3.43, 39.79, None)

    assert report.terrain.elevation_m is None
    assert "unavailable" in report.terrain.terrain_class.lower()
    assert report.soil.status == "Unavailable"


def test_soilgrids_interpretation_is_farmer_readable() -> None:
    interpretation = SoilGridsSoilProvider._interpret(
        {
            "Soil pH": 6.1,
            "Clay": 42,
            "Sand": 31,
            "Organic carbon": 12,
        }
    )

    assert "moderately acidic" in interpretation
    assert "clay-rich" in interpretation
    assert "representative soil samples" in interpretation


def test_enso_provider_parses_probabilities_and_oni() -> None:
    tracker = EnsoProvider._build_tracker(
        """
        <h2>Issued September 2026</h2>
        <tr><th scope="row"><abbr>ASO <span>Aug Sep Oct</span></abbr></th>
        <td>0</td><td>0</td><td>100</td></tr>
        <tr><th scope="row"><abbr>SON <span>Sep Oct Nov</span></abbr></th>
        <td>1</td><td>9</td><td>90</td></tr>
        """,
        """
        SEAS YR TOTAL ANOM
        MJJ 2026 27.10 0.42
        JJA 2026 27.40 0.67
        """,
        datetime.now(timezone.utc),
    )

    assert tracker.status == "Available"
    assert tracker.outlook_phase == "El Niño"
    assert tracker.observed_phase == "El Niño signal"
    assert tracker.probabilities[0].el_nino_percent == 100
    assert tracker.latest_observation.anomaly_c == 0.67
    assert str(tracker.pacific_map_url).endswith("sstaanim.gif")
    assert str(tracker.iod_map_url).endswith("oisst_7day_ind_anom.gif")


def test_enso_context_uses_selected_country_and_season() -> None:
    relationship, context = EnsoProvider._regional_context(
        "El Niño",
        "Kenya",
        "OND",
    )

    assert relationship == "Historically relevant"
    assert "Kenya" in context
    assert "short-rains" in context


def test_enso_context_does_not_force_local_signal_for_mixed_season() -> None:
    relationship, context = EnsoProvider._regional_context(
        "El Niño",
        "Ethiopia",
        "ASO",
    )

    assert relationship == "Mixed / season-dependent"
    assert "not strong enough for a local wet/dry conclusion" in context


def test_assistant_rejects_questions_outside_available_evidence() -> None:
    report = SimpleNamespace(
        recent=SimpleNamespace(classification="Dry", explanation="No recent rain."),
        crop=SimpleNamespace(
            crop="maize",
            category="Good",
            reasons=["Climate is suitable."],
            risks=["Soil is unverified."],
            confidence="Low",
            confidence_explanation="Soil evidence is missing.",
        ),
        sources=[
            SimpleNamespace(provider="Open-Meteo"),
            SimpleNamespace(provider="Planter rules"),
        ],
    )

    response = answer_farm_question("What pesticide dose should I use?", report)

    assert response.supported_intent == "unsupported"
    assert response.citations == []
    assert "cannot answer" in response.answer


def test_livestock_assessment_exposes_constraints() -> None:
    climate = [
        ClimateMonth(month=str(month), rainfall_mm=80, mean_temperature_c=24)
        for month in range(12)
    ]
    assessments = assess_livestock(climate, 1600)
    assert len(assessments) == 7
    assert all(item.constraints for item in assessments)
    assert all(item.confidence == "Low" for item in assessments)


def test_crop_catalog_separates_catalog_entries_from_validated_rules() -> None:
    items = list_crop_catalog()
    pineapple = next(item for item in items if item.name == "pineapple")
    baobab = next(item for item in items if item.name == "baobab")
    maize = next(item for item in items if item.name == "maize")

    assert pineapple.rule_status == "Validated prototype rule"
    assert baobab.rule_status == "Rule pending validation"
    assert baobab.wikipedia_title
    assert any("http" in source for source in baobab.source_notes)
    assert maize.rule_status == "Validated prototype rule"
    assert maize.category == "other"


def test_crop_catalog_resolves_aliases_without_enabling_scoring() -> None:
    item, suggestions = resolve_catalog_name("monkey bread tree")

    assert item is not None
    assert item.name == "baobab"
    assert item.rule_status == "Rule pending validation"
    assert suggestions == []
