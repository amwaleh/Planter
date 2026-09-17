import os
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient


@dataclass(frozen=True)
class AuthenticatedUser:
    subject: str
    display_name: str | None = None
    email: str | None = None


@dataclass(frozen=True)
class AuthSettings:
    issuer: str
    audience: str
    jwks_url: str
    required_scope: str


bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def get_auth_settings() -> AuthSettings:
    issuer = os.getenv("ENTRA_ISSUER", "").rstrip("/")
    audience = os.getenv("ENTRA_API_CLIENT_ID", "")
    required_scope = os.getenv("ENTRA_REQUIRED_SCOPE", "FarmProjects.ReadWrite")
    if not issuer or not audience:
        raise RuntimeError(
            "ENTRA_ISSUER and ENTRA_API_CLIENT_ID must be configured."
        )
    jwks_url = os.getenv("ENTRA_JWKS_URL", "")
    if not jwks_url:
        issuer_root = issuer.removesuffix("/v2.0")
        jwks_url = f"{issuer_root}/discovery/v2.0/keys"
    return AuthSettings(
        issuer=issuer,
        audience=audience,
        jwks_url=jwks_url,
        required_scope=required_scope,
    )


@lru_cache
def get_jwk_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None:
        raise _unauthorized("Sign in is required to access farm projects.")
    try:
        settings = get_auth_settings()
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Federated authentication is not configured on this API.",
        ) from error

    try:
        signing_key = get_jwk_client(settings.jwks_url).get_signing_key_from_jwt(
            credentials.credentials
        )
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.audience,
            issuer=settings.issuer,
            options={"require": ["exp", "iat", "nbf", "sub"]},
        )
    except jwt.PyJWTError as error:
        raise _unauthorized("The access token is invalid or expired.") from error

    scopes = set(str(claims.get("scp", "")).split())
    if settings.required_scope and settings.required_scope not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The access token does not grant farm-project access.",
        )

    return AuthenticatedUser(
        subject=str(claims["sub"]),
        display_name=claims.get("name"),
        email=claims.get("email") or claims.get("preferred_username"),
    )
