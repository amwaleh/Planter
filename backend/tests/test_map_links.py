import pytest

from app.map_links import extract_coordinates, resolve_google_maps_link
from app.region import is_within_east_africa


@pytest.mark.parametrize(
    ("link", "expected"),
    [
        (
            "https://www.google.com/maps/@-1.286389,36.817223,14z",
            (-1.286389, 36.817223),
        ),
        (
            "https://www.google.com/maps/search/-3.434860,+39.779161",
            (-3.43486, 39.779161),
        ),
        (
            "https://maps.google.com/?q=-0.091702,34.767956",
            (-0.091702, 34.767956),
        ),
    ],
)
def test_extract_coordinates(link: str, expected: tuple[float, float]) -> None:
    assert extract_coordinates(link) == expected


@pytest.mark.asyncio
async def test_rejects_non_google_hosts() -> None:
    with pytest.raises(ValueError, match="Google Maps"):
        await resolve_google_maps_link("https://example.com/maps?q=-1,36")


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [
        (-1.2864, 36.8172),
        (0.3476, 32.5825),
        (-6.7924, 39.2083),
        (9.03, 38.74),
    ],
)
def test_eastern_africa_region_includes_representative_countries(
    latitude: float,
    longitude: float,
) -> None:
    assert is_within_east_africa(latitude, longitude)


def test_eastern_africa_region_excludes_southern_africa() -> None:
    assert not is_within_east_africa(-26.2, 28.0)
