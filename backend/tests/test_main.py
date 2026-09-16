from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app import storage
from app.main import app
from app.models import MapLinkResolution

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
