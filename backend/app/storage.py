import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .crop_data import CROP_RULES, CropRule
from .models import (
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


def save_farm_project(payload: FarmProjectCreate) -> FarmProject:
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
                boundary_json, sections_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )
    return project


def list_farm_projects() -> list[FarmProject]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT * FROM farm_projects ORDER BY updated_at DESC"
        ).fetchall()
    return [_project_from_row(row) for row in rows]


def get_farm_project(project_id: str) -> FarmProject | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM farm_projects WHERE id = ?", (project_id,)
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
    custom_keys = _custom_crop_keys()
    return [
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
            source="User-provided prototype rule" if key in custom_keys else "Planter prototype catalog",
            custom=key in custom_keys,
        )
        for key, rule in sorted(CROP_RULES.items(), key=lambda item: item[1].name)
    ]


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


def _custom_crop_keys() -> set[str]:
    with _connect() as connection:
        return {
            row["key"]
            for row in connection.execute("SELECT key FROM custom_crop_rules")
        }
