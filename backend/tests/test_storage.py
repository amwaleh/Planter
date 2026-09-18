from pathlib import Path

from app.crop_data import CROP_RULES
from app.crop_catalog import list_crop_catalog
from app.models import (
    Coordinate,
    CropRuleCreate,
    FarmProjectCreate,
    FarmMarker,
    FarmSection,
)
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
        "user-a",
        FarmProjectCreate(
            name="Demo farm",
            center_latitude=-1.03,
            center_longitude=36.04,
            boundaries=[boundary],
            sections=[
                FarmSection(
                    name="North plot",
                    activity="Planting maize",
                    crop="maize",
                    boundary=boundary,
                )
            ],
            markers=[
                FarmMarker(
                    id="water-1",
                    name="Main borehole",
                    category="Water",
                    notes="Solar pump",
                    color="#2878b5",
                    image_data_url="data:image/png;base64,aGVsbG8=",
                    position=Coordinate(latitude=-1.03, longitude=36.04),
                )
            ],
        )
    )

    loaded = storage.get_farm_project("user-a", project.id)
    assert loaded is not None
    assert loaded.name == "Demo farm"
    assert loaded.sections[0].activity == "Planting maize"
    assert loaded.markers[0].name == "Main borehole"
    assert loaded.markers[0].color == "#2878b5"
    assert loaded.markers[0].image_data_url == "data:image/png;base64,aGVsbG8="

    second_boundary = [
        Coordinate(latitude=-1.2, longitude=36.2),
        Coordinate(latitude=-1.2, longitude=36.3),
        Coordinate(latitude=-1.3, longitude=36.3),
    ]
    updated = storage.update_farm_project(
        "user-a",
        project.id,
        FarmProjectCreate(
            name="Demo farm updated",
            center_latitude=-1.04,
            center_longitude=36.05,
            boundaries=[
                [*boundary, Coordinate(latitude=-1.1, longitude=36.0)],
                second_boundary,
            ],
            sections=[
                FarmSection(
                    name="South plot",
                    activity="Grazing rotation",
                    crop="pasture",
                    boundary=boundary,
                )
            ],
            markers=[],
        ),
    )
    assert updated is not None
    reloaded = storage.get_farm_project("user-a", project.id)
    assert reloaded is not None
    assert reloaded.name == "Demo farm updated"
    assert len(reloaded.boundaries) == 2
    assert len(reloaded.boundaries[0]) == 4
    assert reloaded.sections[0].name == "South plot"
    assert reloaded.sections[0].activity == "Grazing rotation"
    assert reloaded.markers == []
    assert storage.list_farm_projects("user-b") == []
    assert storage.get_farm_project("user-b", project.id) is None
    assert storage.update_farm_project(
        "user-b",
        project.id,
        FarmProjectCreate(
            name="Other user's edit",
            center_latitude=-1.04,
            center_longitude=36.05,
            boundaries=[boundary],
            sections=[],
            markers=[],
        ),
    ) is None


def test_storage_migration_does_not_expose_unowned_projects(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    with storage._connect() as connection:
        connection.execute(
            """
            CREATE TABLE farm_projects (
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
            INSERT INTO farm_projects VALUES (
                'legacy', 'Legacy farm', -1, 36, '[]', '[]',
                '2025-01-01T00:00:00+00:00', '2025-01-01T00:00:00+00:00'
            )
            """
        )

    storage.initialize_storage()

    assert storage.list_farm_projects("user-a") == []


def test_storage_migration_adds_empty_markers_to_owned_projects(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    with storage._connect() as connection:
        connection.execute(
            """
            CREATE TABLE farm_projects (
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
        connection.execute(
            """
            INSERT INTO farm_projects VALUES (
                'owned-legacy', 'Owned legacy farm', -1, 36,
                '[[{"latitude": -1, "longitude": 36}, {"latitude": -1, "longitude": 36.1}, {"latitude": -1.1, "longitude": 36.1}]]',
                '[]', '2025-01-01T00:00:00+00:00',
                '2025-01-01T00:00:00+00:00', 'user-a'
            )
            """
        )

    storage.initialize_storage()

    project = storage.get_farm_project("user-a", "owned-legacy")
    assert project is not None
    assert project.markers == []


def test_legacy_single_boundary_payload_is_migrated() -> None:
    payload = FarmProjectCreate.model_validate(
        {
            "name": "Legacy API farm",
            "center_latitude": -1.03,
            "center_longitude": 36.04,
            "boundary": [
                {"latitude": -1.0, "longitude": 36.0},
                {"latitude": -1.0, "longitude": 36.1},
                {"latitude": -1.1, "longitude": 36.1},
            ],
            "sections": [],
        }
    )

    assert len(payload.boundaries) == 1
    assert len(payload.boundaries[0]) == 3


def test_custom_crop_rule_round_trip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    payload = CropRuleCreate(
        name="Test berry",
        category="fruits",
        wikipedia_title="Berry",
        image_url="https://example.com/berry.jpg",
        image_source_page_url="https://example.com/berry",
        image_creator="Test photographer",
        image_license="CC BY 4.0",
        image_license_url="https://creativecommons.org/licenses/by/4.0/",
        image_alt_text="Ripe test berries on a plant",
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
        assert saved.category == "fruits"
        assert saved.wikipedia_title == "Berry"
        assert any(record.key == "test_berry" and record.custom for record in records)
        catalog_item = next(item for item in list_crop_catalog() if item.name == "Test berry")
        assert catalog_item.wikipedia_title == "Berry"
        assert catalog_item.source_notes == ["Test agronomy reference"]
        assert catalog_item.image is not None
        assert str(catalog_item.image.image_url) == "https://example.com/berry.jpg"
        assert catalog_item.image.creator == "Test photographer"
    finally:
        CROP_RULES.pop("test_berry", None)


def test_custom_rule_merges_into_existing_catalog_entry(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(storage, "DATABASE_PATH", tmp_path / "planter.db")
    storage.initialize_storage()
    payload = CropRuleCreate(
        name="Baobab",
        category="fruits",
        wikipedia_title="Adansonia digitata",
        image_url="https://example.com/baobab.jpg",
        image_source_page_url="https://example.com/baobab",
        image_creator="Test photographer",
        image_license="CC BY 4.0",
        image_alt_text="A mature baobab tree with fruit",
        temperature_min_c=20,
        temperature_max_c=35,
        monthly_rainfall_min_mm=20,
        monthly_rainfall_max_mm=90,
        elevation_min_m=0,
        elevation_max_m=1500,
        duration_min_days=365,
        duration_max_days=3650,
        planting_guidance="Use locally validated propagation and establishment guidance.",
        sensitivities=["Young trees need protection during establishment."],
        source="Test baobab agronomy reference",
    )
    try:
        storage.save_crop_rule(payload)
        matches = [item for item in list_crop_catalog() if item.name.lower() == "baobab"]
        assert len(matches) == 1
        assert matches[0].rule_status == "Validated prototype rule"
        assert matches[0].wikipedia_title == "Adansonia digitata"
        assert matches[0].image is not None
        assert matches[0].source_notes[0] == "Test baobab agronomy reference"
    finally:
        CROP_RULES.pop("baobab", None)
