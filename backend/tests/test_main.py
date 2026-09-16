from fastapi.testclient import TestClient

from app.main import app

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
