from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt

import httpx

from ..models import SurfaceWaterFeature

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


class OpenStreetMapWaterProvider:
    def __init__(self, timeout_seconds: float = 20.0) -> None:
        self.timeout = httpx.Timeout(timeout_seconds)

    async def nearest(
        self, latitude: float, longitude: float, radius_m: int = 10_000
    ) -> SurfaceWaterFeature | None:
        query = (
            f"[out:json][timeout:10];("
            f"nwr(around:{radius_m},{latitude},{longitude})[natural=water];"
            f"nwr(around:{radius_m},{latitude},{longitude})[waterway];"
            f"nwr(around:{radius_m},{latitude},{longitude})[water=reservoir];"
            f"nwr(around:{radius_m},{latitude},{longitude})[man_made=water_well];"
            ");out center;"
        )
        async with httpx.AsyncClient(
            timeout=self.timeout,
            headers={"User-Agent": "Planter/0.1", "Accept": "application/json"},
        ) as client:
            response = await client.get(OVERPASS_URL, params={"data": query})
        response.raise_for_status()
        features: list[SurfaceWaterFeature] = []
        for element in response.json().get("elements", []):
            center = element.get("center", {})
            feature_latitude = element.get("lat", center.get("lat"))
            feature_longitude = element.get("lon", center.get("lon"))
            if feature_latitude is None or feature_longitude is None:
                continue
            tags = element.get("tags", {})
            kind = tags.get("water") or tags.get("waterway") or tags.get("natural") or "water feature"
            features.append(
                SurfaceWaterFeature(
                    name=tags.get("name") or f"Mapped {kind}",
                    kind=kind,
                    latitude=feature_latitude,
                    longitude=feature_longitude,
                    distance_km=round(
                        _distance_km(
                            latitude,
                            longitude,
                            feature_latitude,
                            feature_longitude,
                        ),
                        2,
                    ),
                    source="OpenStreetMap contributors",
                    limitations=[
                        "Map presence does not prove legal access, water quality, reliability, or year-round flow.",
                        "The nearest feature may be incomplete or outdated because map coverage varies.",
                    ],
                )
            )
        return min(features, key=lambda feature: feature.distance_km) if features else None


def _distance_km(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    earth_radius_km = 6371.0088
    delta_latitude = radians(latitude_b - latitude_a)
    delta_longitude = radians(longitude_b - longitude_a)
    a = (
        sin(delta_latitude / 2) ** 2
        + cos(radians(latitude_a))
        * cos(radians(latitude_b))
        * sin(delta_longitude / 2) ** 2
    )
    return 2 * earth_radius_km * asin(sqrt(a))
