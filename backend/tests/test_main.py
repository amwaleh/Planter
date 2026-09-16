from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

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
