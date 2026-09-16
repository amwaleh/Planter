import re
from urllib.parse import parse_qs, unquote, urlparse

import httpx

from .models import MapLinkResolution

ALLOWED_HOSTS = {
    "maps.app.goo.gl",
    "goo.gl",
    "google.com",
    "www.google.com",
    "maps.google.com",
}
COORDINATE_PATTERN = re.compile(
    r"(?<!\d)(-?\d{1,2}(?:\.\d+)?),\s*\+?(-?\d{1,3}(?:\.\d+)?)(?!\d)"
)


def _validate_google_maps_url(link: str) -> None:
    parsed = urlparse(link)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("Use an HTTPS Google Maps share link.")


def extract_coordinates(link: str) -> tuple[float, float] | None:
    decoded_link = unquote(link)
    parsed = urlparse(decoded_link)

    candidates = [parsed.path, parsed.fragment]
    query = parse_qs(parsed.query)
    for key in ("q", "query", "destination", "center"):
        candidates.extend(query.get(key, []))

    for candidate in candidates:
        match = COORDINATE_PATTERN.search(candidate)
        if match:
            latitude, longitude = map(float, match.groups())
            if -90 <= latitude <= 90 and -180 <= longitude <= 180:
                return latitude, longitude
    return None


async def resolve_google_maps_link(link: str) -> MapLinkResolution:
    normalized_link = link.strip()
    _validate_google_maps_url(normalized_link)

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(15.0),
        follow_redirects=True,
        headers={"User-Agent": "Planter/0.1 farm-location-resolver"},
    ) as client:
        response = await client.get(normalized_link)
    response.raise_for_status()

    redirect_urls = [str(item.url) for item in response.history] + [str(response.url)]
    for redirect_url in redirect_urls:
        _validate_google_maps_url(redirect_url)

    coordinates = extract_coordinates(str(response.url))
    if coordinates is None:
        coordinates = extract_coordinates(response.text)
    if coordinates is None:
        raise ValueError(
            "This Google Maps link does not expose coordinates. Share a dropped pin or place link."
        )

    latitude, longitude = coordinates
    if not (-4.9 <= latitude <= 5.0 and 33.5 <= longitude <= 42.1):
        raise ValueError("The shared location is outside the Kenya MVP coverage area.")

    return MapLinkResolution(
        latitude=latitude,
        longitude=longitude,
        resolved_url=str(response.url),
    )

