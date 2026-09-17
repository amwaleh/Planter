import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .crop_data import CROP_RULES, CropRule
from .models import (
    CropImageMetadata,
    CropRuleCreate,
    CropRuleRecord,
    FarmProject,
    FarmProjectCreate,
)

DATABASE_PATH = Path(__file__).resolve().parent.parent / "data" / "planter.db"


def _connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_storage() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS farm_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                center_latitude REAL NOT NULL,
                center_longitude REAL NOT NULL,
                boundary_json TEXT NOT NULL,
                sections_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                owner_id TEXT
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(farm_projects)").fetchall()
        }
        if "owner_id" not in columns:
            connection.execute("ALTER TABLE farm_projects ADD COLUMN owner_id TEXT")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_farm_projects_owner_updated
            ON farm_projects (owner_id, updated_at DESC)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profiles (
                owner_id TEXT PRIMARY KEY,
                display_name TEXT,
                email TEXT,
                last_seen_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS crop_images (
                crop_key TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_crop_rules (
                key TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
    load_custom_crop_rules()


def upsert_user_profile(
    owner_id: str,
    display_name: str | None,
    email: str | None,
) -> None:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO user_profiles (owner_id, display_name, email, last_seen_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(owner_id) DO UPDATE SET
                display_name = excluded.display_name,
                email = excluded.email,
                last_seen_at = excluded.last_seen_at
            """,
            (
                owner_id,
                display_name,
                email,
                datetime.now(timezone.utc).isoformat(),
            ),
        )


def save_farm_project(owner_id: str, payload: FarmProjectCreate) -> FarmProject:
    now = datetime.now(timezone.utc)
    project = FarmProject(
        id=str(uuid4()),
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO farm_projects (
                id, name, center_latitude, center_longitude,
                boundary_json, sections_json, created_at, updated_at, owner_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project.id,
                project.name,
                project.center_latitude,
                project.center_longitude,
                json.dumps([point.model_dump() for point in project.boundary]),
                json.dumps([section.model_dump() for section in project.sections]),
                project.created_at.isoformat(),
                project.updated_at.isoformat(),
                owner_id,
            ),
        )
    return project


def update_farm_project(
    owner_id: str,
    project_id: str,
    payload: FarmProjectCreate,
) -> FarmProject | None:
    with _connect() as connection:
        existing = connection.execute(
            "SELECT created_at FROM farm_projects WHERE id = ? AND owner_id = ?",
            (project_id, owner_id),
        ).fetchone()
        if existing is None:
            return None
        project = FarmProject(
            id=project_id,
            created_at=datetime.fromisoformat(existing["created_at"]),
            updated_at=datetime.now(timezone.utc),
            **payload.model_dump(),
        )
        connection.execute(
            """
            UPDATE farm_projects
            SET name = ?, center_latitude = ?, center_longitude = ?,
                boundary_json = ?, sections_json = ?, updated_at = ?
            WHERE id = ? AND owner_id = ?
            """,
            (
                project.name,
                project.center_latitude,
                project.center_longitude,
                json.dumps([point.model_dump() for point in project.boundary]),
                json.dumps([section.model_dump() for section in project.sections]),
                project.updated_at.isoformat(),
                project.id,
                owner_id,
            ),
        )
    return project


def list_farm_projects(owner_id: str) -> list[FarmProject]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT * FROM farm_projects
            WHERE owner_id = ?
            ORDER BY updated_at DESC
            """,
            (owner_id,),
        ).fetchall()
    return [_project_from_row(row) for row in rows]


def get_farm_project(owner_id: str, project_id: str) -> FarmProject | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM farm_projects WHERE id = ? AND owner_id = ?",
            (project_id, owner_id),
        ).fetchone()
    return _project_from_row(row) if row else None


def _project_from_row(row: sqlite3.Row) -> FarmProject:
    return FarmProject(
        id=row["id"],
        name=row["name"],
        center_latitude=row["center_latitude"],
        center_longitude=row["center_longitude"],
        boundary=json.loads(row["boundary_json"]),
        sections=json.loads(row["sections_json"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def list_crop_rules() -> list[CropRuleRecord]:
    custom_records = _custom_crop_records()
    built_in_records = [
        CropRuleRecord(
            key=key,
            name=rule.name,
            temperature_min_c=rule.temperature_range[0],
            temperature_max_c=rule.temperature_range[1],
            monthly_rainfall_min_mm=rule.preferred_monthly_rainfall[0],
            monthly_rainfall_max_mm=rule.preferred_monthly_rainfall[1],
            elevation_min_m=rule.elevation_range[0],
            elevation_max_m=rule.elevation_range[1],
            duration_min_days=rule.duration_days[0],
            duration_max_days=rule.duration_days[1],
            planting_guidance=rule.planting_guidance,
            sensitivities=list(rule.sensitivities),
            source="Planter prototype catalog",
            custom=False,
        )
        for key, rule in sorted(CROP_RULES.items(), key=lambda item: item[1].name)
        if key not in custom_records
    ]
    return sorted(
        [*built_in_records, *custom_records.values()],
        key=lambda record: record.name.lower(),
    )


def save_crop_rule(payload: CropRuleCreate) -> CropRuleRecord:
    key = "_".join(payload.name.strip().lower().replace("-", " ").split())
    if key in CROP_RULES:
        raise ValueError(f"A crop rule already exists for '{payload.name}'.")
    rule = CropRule(
        name=payload.name.strip().lower(),
        temperature_range=(payload.temperature_min_c, payload.temperature_max_c),
        preferred_monthly_rainfall=(
            payload.monthly_rainfall_min_mm,
            payload.monthly_rainfall_max_mm,
        ),
        elevation_range=(payload.elevation_min_m, payload.elevation_max_m),
        duration_days=(payload.duration_min_days, payload.duration_max_days),
        planting_guidance=payload.planting_guidance.strip(),
        sensitivities=tuple(payload.sensitivities),
    )
    record = CropRuleRecord(key=key, custom=True, **payload.model_dump())
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO custom_crop_rules (key, payload_json, created_at)
            VALUES (?, ?, ?)
            """,
            (key, record.model_dump_json(), datetime.now(timezone.utc).isoformat()),
        )
    CROP_RULES[key] = rule
    return record


def load_custom_crop_rules() -> None:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT key, payload_json FROM custom_crop_rules"
        ).fetchall()
    for row in rows:
        record = CropRuleRecord.model_validate_json(row["payload_json"])
        CROP_RULES[row["key"]] = CropRule(
            name=record.name,
            temperature_range=(
                record.temperature_min_c,
                record.temperature_max_c,
            ),
            preferred_monthly_rainfall=(
                record.monthly_rainfall_min_mm,
                record.monthly_rainfall_max_mm,
            ),
            elevation_range=(record.elevation_min_m, record.elevation_max_m),
            duration_days=(record.duration_min_days, record.duration_max_days),
            planting_guidance=record.planting_guidance,
            sensitivities=tuple(record.sensitivities),
        )


def _custom_crop_records() -> dict[str, CropRuleRecord]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT key, payload_json FROM custom_crop_rules"
        ).fetchall()
    return {
        row["key"]: CropRuleRecord.model_validate_json(row["payload_json"])
        for row in rows
    }


def get_crop_image(crop_key: str) -> CropImageMetadata | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT payload_json FROM crop_images WHERE crop_key = ?",
            (crop_key,),
        ).fetchone()
    return CropImageMetadata.model_validate_json(row["payload_json"]) if row else None


def save_crop_image(crop_key: str, image: CropImageMetadata) -> CropImageMetadata:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO crop_images (crop_key, payload_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(crop_key) DO UPDATE SET
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            """,
            (crop_key, image.model_dump_json(), datetime.now(timezone.utc).isoformat()),
        )
    return image
