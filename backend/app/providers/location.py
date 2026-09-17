from datetime import datetime, timezone

import httpx

from ..models import LocationContext

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"


class NominatimLocationProvider:
    def __init__(self, timeout_seconds: float = 12.0) -> None:
        self.timeout = httpx.Timeout(timeout_seconds)

    async def reverse(self, latitude: float, longitude: float) -> LocationContext:
        async with httpx.AsyncClient(
            timeout=self.timeout,
            headers={"User-Agent": "Planter/0.1 (farm intelligence prototype)"},
        ) as client:
            response = await client.get(
                NOMINATIM_URL,
                params={
                    "format": "jsonv2",
                    "lat": latitude,
                    "lon": longitude,
                    "zoom": 14,
                    "addressdetails": 1,
                },
            )
        response.raise_for_status()
        payload = response.json()
        address = payload.get("address", {})
        place = (
            address.get("village")
            or address.get("town")
            or address.get("city")
            or address.get("municipality")
            or address.get("locality")
        )
        county = address.get("county") or address.get("state")
        ward = address.get("suburb") or address.get("quarter")
        subcounty = address.get("city_district") or address.get("district")
        country = address.get("country")
        display_parts = [part for part in (place, county) if part]
        display_name = ", ".join(display_parts) or f"{latitude:.4f}, {longitude:.4f}"
        return LocationContext(
            display_name=display_name,
            place=place,
            ward_or_suburb=ward,
            subcounty=subcounty,
            county=county,
            country=country,
            source="OpenStreetMap Nominatim",
            retrieved_at=datetime.now(timezone.utc),
            limitations=[
                "Administrative names depend on OpenStreetMap coverage and may omit wards or local names.",
                "Coordinates remain the authoritative location used for environmental queries.",
            ],
        )
