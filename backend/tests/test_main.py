import asyncio
from pathlib import Path
from fastapi.testclient import TestClient
from httpx import HTTPError
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import storage
from app.auth import AuthenticatedUser
from app.main import app
from app.models import EnsoTracker, MapLinkResolution, SoilIntelligence
from app.users import Base, get_async_session, get_current_user

client = TestClient(app)


def authenticated_as(subject: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        subject=subject,
        display_name=f"User {subject}",
        email=f"{subject}@example.com",
    )


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
    authenticated_as("user-a")
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
            "boundaries": [boundary],
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
    second_boundary = [
        {"latitude": -1.2, "longitude": 36.2},
        {"latitude": -1.2, "longitude": 36.3},
        {"latitude": -1.3, "longitude": 36.3},
    ]
    updated = client.put(
        f"/api/v1/projects/{project_id}",
        json={
            "name": "API farm",
            "center_latitude": -1.04,
            "center_longitude": 36.05,
            "boundaries": [updated_boundary, second_boundary],
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
    assert reloaded.json()["boundaries"] == [updated_boundary, second_boundary]
    assert reloaded.json()["sections"][0]["name"] == "South field"
    assert reloaded.json()["sections"][0]["activity"] == "Drip-irrigated vegetables"

    authenticated_as("user-b")
    assert client.get("/api/v1/projects").json() == []
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert client.put(
        f"/api/v1/projects/{project_id}",
        json={
            "name": "Stolen farm",
            "center_latitude": -1.04,
            "center_longitude": 36.05,
            "boundaries": [updated_boundary, second_boundary],
            "sections": [],
        },
    ).status_code == 404
    app.dependency_overrides.pop(get_current_user, None)


def test_project_api_requires_authentication(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    app.dependency_overrides.pop(get_current_user, None)

    response = client.get("/api/v1/projects")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_user_can_register_login_and_access_projects(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    user_engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'users.db').as_posix()}"
    )
    sessions = async_sessionmaker(user_engine, expire_on_commit=False)

    async def initialize_users() -> None:
        async with user_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    async def session_override():
        async with sessions() as session:
            yield session

    asyncio.run(initialize_users())
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides[get_async_session] = session_override
    try:
        registered = client.post(
            "/api/v1/auth/register",
            json={
                "email": "farmer@example.com",
                "password": "StrongPassword123!",
            },
        )
        assert registered.status_code == 201

        weak_registration = client.post(
            "/api/v1/auth/register",
            json={
                "email": "weak@example.com",
                "password": "short",
            },
        )
        assert weak_registration.status_code == 400

        logged_in = client.post(
            "/api/v1/auth/jwt/login",
            data={
                "username": "farmer@example.com",
                "password": "StrongPassword123!",
            },
        )
        assert logged_in.status_code == 200
        token = logged_in.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        profile = client.get("/api/v1/users/me", headers=headers)
        projects = client.get("/api/v1/projects", headers=headers)

        assert profile.status_code == 200
        assert profile.json()["email"] == "farmer@example.com"
        assert projects.status_code == 200
        assert projects.json() == []
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        asyncio.run(user_engine.dispose())


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
        regional_location="Kenya",
        regional_season="OND",
        regional_relationship="Historically relevant",
        confidence="Medium",
        source="NOAA Climate Prediction Center",
        source_url="https://www.cpc.ncep.noaa.gov/",
        regional_source="ICPAC",
        regional_source_url="https://www.icpac.net/seasonal-forecast/",
        pacific_map_url="https://www.cpc.ncep.noaa.gov/map.gif",
        pacific_map_source_url="https://www.cpc.ncep.noaa.gov/",
        pacific_map_description="Tropical Pacific anomaly map.",
        iod_map_url="https://www.cpc.ncep.noaa.gov/iod-map.gif",
        iod_map_source_url="https://www.cpc.ncep.noaa.gov/iod/",
        iod_map_description="Indian Ocean anomaly map.",
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
    assert response.json()["iod_map_url"].endswith("iod-map.gif")
