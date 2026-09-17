from unittest.mock import Mock, patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import get_auth_settings, validate_external_token


def test_valid_access_token_returns_stable_subject(monkeypatch) -> None:
    monkeypatch.setenv("ENTRA_ISSUER", "https://login.example/tenant/v2.0")
    monkeypatch.setenv("ENTRA_API_CLIENT_ID", "api-client")
    get_auth_settings.cache_clear()
    signing_key = Mock()
    signing_key.key = "public-key"
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="token",
    )

    with (
        patch("app.auth.get_jwk_client") as jwk_client,
        patch(
            "app.auth.jwt.decode",
            return_value={
                "sub": "stable-subject",
                "name": "Test User",
                "preferred_username": "test@example.com",
                "scp": "FarmProjects.ReadWrite",
            },
        ),
    ):
        jwk_client.return_value.get_signing_key_from_jwt.return_value = signing_key
        user = validate_external_token(credentials)

    assert user.subject == "stable-subject"
    assert user.email == "test@example.com"


def test_invalid_access_token_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("ENTRA_ISSUER", "https://login.example/tenant/v2.0")
    monkeypatch.setenv("ENTRA_API_CLIENT_ID", "api-client")
    get_auth_settings.cache_clear()
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="invalid",
    )

    with patch("app.auth.get_jwk_client") as jwk_client:
        jwk_client.return_value.get_signing_key_from_jwt.side_effect = (
            jwt.InvalidTokenError("invalid")
        )
        with pytest.raises(HTTPException) as error:
            validate_external_token(credentials)

    assert error.value.status_code == 401
