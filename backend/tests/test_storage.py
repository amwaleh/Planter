from pathlib import Path

from app.crop_data import CROP_RULES
from app.models import Coordinate, CropRuleCreate, FarmProjectCreate, FarmSection
from app import storage


def test_farm_project_round_trip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    boundary = [
        Coordinate(latitude=-1.0, longitude=36.0),
        Coordinate(latitude=-1.0, longitude=36.1),
        Coordinate(latitude=-1.1, longitude=36.1),
    ]
    project = storage.save_farm_project(
        FarmProjectCreate(
            name="Demo farm",
            center_latitude=-1.03,
            center_longitude=36.04,
            boundary=boundary,
            sections=[
                FarmSection(
                    name="North plot",
                    activity="Planting maize",
                    crop="maize",
                    boundary=boundary,
                )
            ],
        )
    )

    loaded = storage.get_farm_project(project.id)
    assert loaded is not None
    assert loaded.name == "Demo farm"
    assert loaded.sections[0].activity == "Planting maize"


def test_custom_crop_rule_round_trip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    payload = CropRuleCreate(
        name="Test berry",
        temperature_min_c=15,
        temperature_max_c=26,
        monthly_rainfall_min_mm=50,
        monthly_rainfall_max_mm=100,
        elevation_min_m=1000,
        elevation_max_m=2200,
        duration_min_days=120,
        duration_max_days=180,
        planting_guidance="Plant with dependable moisture using validated local guidance.",
        sensitivities=["Waterlogging reduces root health."],
        source="Test agronomy reference",
    )
    try:
        saved = storage.save_crop_rule(payload)
        records = storage.list_crop_rules()
        assert saved.key == "test_berry"
        assert any(record.key == "test_berry" and record.custom for record in records)
    finally:
        CROP_RULES.pop("test_berry", None)
