import os
import secrets
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from fastapi_users import (
    BaseUserManager,
    FastAPIUsers,
    UUIDIDMixin,
    exceptions,
    models,
    schemas,
)
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from starlette.concurrency import run_in_threadpool

from .auth import AuthenticatedUser, bearer_scheme, validate_external_token

USER_DATABASE_PATH = Path(__file__).resolve().parent.parent / "data" / "users.db"
AUTH_SECRET_PATH = Path(__file__).resolve().parent.parent / "data" / ".auth-secret"


def _auth_secret() -> str:
    configured_secret = os.getenv("PLANTER_AUTH_SECRET")
    if configured_secret:
        return configured_secret
    AUTH_SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    if AUTH_SECRET_PATH.exists():
        return AUTH_SECRET_PATH.read_text(encoding="utf-8").strip()
    generated_secret = secrets.token_urlsafe(64)
    AUTH_SECRET_PATH.write_text(generated_secret, encoding="utf-8")
    return generated_secret


class Base(DeclarativeBase):
    pass


class User(SQLAlchemyBaseUserTableUUID, Base):
    pass


class UserRead(schemas.BaseUser[uuid.UUID]):
    pass


class UserCreate(schemas.BaseUserCreate):
    pass


engine = create_async_engine(f"sqlite+aiosqlite:///{USER_DATABASE_PATH.as_posix()}")
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def create_user_db() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def get_user_db(
    session: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[SQLAlchemyUserDatabase, None]:
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = _auth_secret()
    verification_token_secret = _auth_secret()

    async def validate_password(
        self,
        password: str,
        user: UserCreate | User,
    ) -> None:
        if len(password) < 8:
            raise exceptions.InvalidPasswordException(
                reason="Password must contain at least 8 characters."
            )
        email_prefix = user.email.split("@", maxsplit=1)[0].lower()
        if email_prefix and email_prefix in password.lower():
            raise exceptions.InvalidPasswordException(
                reason="Password must not contain the email name."
            )

    async def on_after_register(
        self,
        user: User,
        request: Request | None = None,
    ) -> None:
        del user, request


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase = Depends(get_user_db),
) -> AsyncGenerator[UserManager, None]:
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="api/v1/auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy[models.UP, models.ID]:
    return JWTStrategy(secret=_auth_secret(), lifetime_seconds=60 * 60 * 24)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)
fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
optional_local_user = fastapi_users.current_user(optional=True, active=True)


async def get_current_user(
    local_user: User | None = Depends(optional_local_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if local_user is not None:
        return AuthenticatedUser(
            subject=f"local:{local_user.id}",
            display_name=local_user.email.split("@", maxsplit=1)[0],
            email=local_user.email,
        )
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in is required to access farm projects.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await run_in_threadpool(validate_external_token, credentials)
