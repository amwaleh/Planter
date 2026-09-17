from pathlib import Path
from fastapi.testclient import TestClient
from httpx import HTTPError
from unittest.mock import AsyncMock, patch

import pytest

from app import storage
from app.main import app
from app.models import EnsoTracker, MapLinkResolution, SoilIntelligence

client = TestClient(app)


def test_local_review_origin_is_allowed() -> None:
    response = client.get(
        "/health",
        headers={"Origin": "http://127.0.0.1:5173"},
    )

    assert response.status_code == 200
    assert (
        response.headers["access-control-allow-origin"]
        == "http://127.0.0.1:5173"
    )


def test_local_review_origin_can_post() -> None:
    response = client.options(
        "/api/v1/projects",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "PUT" in response.headers["access-control-allow-methods"]


def test_map_link_endpoint_returns_resolved_coordinates() -> None:
    resolution = MapLinkResolution(
        latitude=-3.43486,
        longitude=39.779161,
        resolved_url="https://www.google.com/maps/search/-3.434860,+39.779161",
    )
    with patch(
        "app.main.resolve_google_maps_link",
        new=AsyncMock(return_value=resolution),
    ):
        response = client.get(
            "/api/v1/resolve-map-link",
            params={"link": "https://maps.app.goo.gl/3EE59AinQG4pTnnu7"},
        )

    assert response.status_code == 200
    assert response.json()["latitude"] == -3.43486


def test_assistant_does_not_substitute_unknown_crop() -> None:
    response = client.post(
        "/api/v1/assistant",
        json={
            "latitude": -1.2864,
            "longitude": 36.8172,
            "crop": "baobab",
            "question": "Can I grow baobab here?",
        },
    )

    assert response.status_code == 200
    assert response.json()["supported_intent"] == "unsupported_crop"
    assert "No other crop was substituted." in response.json()["limitations"]


def test_project_api_create_update_and_reload(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    boundary = [
        {"latitude": -1.0, "longitude": 36.0},
        {"latitude": -1.0, "longitude": 36.1},
        {"latitude": -1.1, "longitude": 36.1},
    ]
    created = client.post(
        "/api/v1/projects",
        json={
            "name": "API farm",
            "center_latitude": -1.03,
            "center_longitude": 36.04,
            "boundary": boundary,
            "sections": [
                {
                    "name": "North field",
                    "activity": "Planting",
                    "crop": "maize",
                    "boundary": boundary,
                }
            ],
        },
    )
    assert created.status_code == 201
    project_id = created.json()["id"]

    updated_boundary = [
        *boundary,
        {"latitude": -1.1, "longitude": 36.0},
    ]
    updated = client.put(
        f"/api/v1/projects/{project_id}",
        json={
            "name": "API farm",
            "center_latitude": -1.04,
            "center_longitude": 36.05,
            "boundary": updated_boundary,
            "sections": [
                {
                    "name": "South field",
                    "activity": "Drip-irrigated vegetables",
                    "crop": "onion",
                    "boundary": boundary,
                }
            ],
        },
    )
    assert updated.status_code == 200

    reloaded = client.get(f"/api/v1/projects/{project_id}")
    assert reloaded.status_code == 200
    assert reloaded.json()["boundary"] == updated_boundary
    assert reloaded.json()["sections"][0]["name"] == "South field"
    assert reloaded.json()["sections"][0]["activity"] == "Drip-irrigated vegetables"


def test_land_endpoint_returns_explicit_state_when_elevation_fails() -> None:
    unavailable_soil = SoilIntelligence(
        status="Unavailable",
        properties={},
        interpretation="Point values unavailable.",
        soil_test_checklist=["Collect samples."],
        limitations=["No modelled values returned."],
    )
    with (
        patch(
            "app.main.provider.fetch_elevation",
            new=AsyncMock(side_effect=HTTPError("provider unavailable")),
        ),
        patch(
            "app.main.soil_provider.profile",
            new=AsyncMock(return_value=unavailable_soil),
        ),
    ):
        response = client.get(
            "/api/v1/land-intelligence",
            params={"latitude": -3.43, "longitude": 39.79},
        )

    assert response.status_code == 200
    assert response.json()["terrain"]["elevation_m"] is None
    assert "unavailable" in response.json()["terrain"]["terrain_class"].lower()


def test_land_endpoint_returns_selected_point_soil_values() -> None:
    soil = SoilIntelligence(
        status="Available",
        properties={"Soil pH": "6.1 pH", "Clay": "42 %"},
        interpretation="Modelled selected-point guidance.",
        soil_test_checklist=["Confirm with representative samples."],
        source="ISRIC SoilGrids 250 m",
        limitations=["Modelled, not a laboratory measurement."],
    )
    with (
        patch(
            "app.main.provider.fetch_elevation",
            new=AsyncMock(return_value=1600),
        ),
        patch(
            "app.main.soil_provider.profile",
            new=AsyncMock(return_value=soil),
        ),
    ):
        response = client.get(
            "/api/v1/land-intelligence",
            params={"latitude": -1.2864, "longitude": 36.8172},
        )

    assert response.status_code == 200
    assert response.json()["soil"]["status"] == "Available"
    assert response.json()["soil"]["properties"]["Soil pH"] == "6.1 pH"
    assert response.json()["soil"]["source"] == "ISRIC SoilGrids 250 m"


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [
        (-1.2864, 36.8172),  # Kenya
        (0.3476, 32.5825),  # Uganda
        (-6.7924, 39.2083),  # Tanzania
        (9.03, 38.74),  # Ethiopia
    ],
)
def test_land_endpoint_accepts_eastern_africa_locations(
    latitude: float,
    longitude: float,
) -> None:
    soil = SoilIntelligence(
        status="Unavailable",
        properties={},
        interpretation="Point values unavailable.",
        soil_test_checklist=["Collect samples."],
        limitations=["No modelled values returned."],
    )
    with (
        patch(
            "app.main.provider.fetch_elevation",
            new=AsyncMock(return_value=1200),
        ),
        patch(
            "app.main.soil_provider.profile",
            new=AsyncMock(return_value=soil),
        ),
    ):
        response = client.get(
            "/api/v1/land-intelligence",
            params={"latitude": latitude, "longitude": longitude},
        )

    assert response.status_code == 200


def test_land_endpoint_rejects_location_outside_eastern_africa() -> None:
    response = client.get(
        "/api/v1/land-intelligence",
        params={"latitude": -26.2, "longitude": 28.0},
    )

    assert response.status_code == 422


def test_enso_endpoint_returns_normalized_tracker() -> None:
    tracker = EnsoTracker(
        status="Available",
        outlook_phase="El Niño",
        observed_phase="El Niño signal",
        issued="September 2026",
        retrieved_at="2026-09-17T08:00:00Z",
        latest_observation={
            "season": "JJA",
            "year": 2026,
            "anomaly_c": 0.7,
        },
        observations=[],
        probabilities=[
            {
                "season": "OND",
                "la_nina_percent": 0,
                "neutral_percent": 5,
                "el_nino_percent": 95,
            }
        ],
        eastern_africa_context="Confirm the regional seasonal outlook.",
        confidence="Medium",
        source="NOAA Climate Prediction Center",
        source_url="https://www.cpc.ncep.noaa.gov/",
        regional_source="ICPAC",
        regional_source_url="https://www.icpac.net/seasonal-forecast/",
        limitations=["Not a local rainfall forecast."],
    )
    with patch(
        "app.main.enso_provider.fetch",
        new=AsyncMock(return_value=tracker),
    ):
        response = client.get("/api/v1/enso")

    assert response.status_code == 200
    assert response.json()["outlook_phase"] == "El Niño"
    assert response.json()["probabilities"][0]["el_nino_percent"] == 95
