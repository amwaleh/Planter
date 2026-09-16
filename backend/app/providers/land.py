import asyncio
from dataclasses import dataclass
from typing import Protocol

import httpx

from ..models import SoilIntelligence, TerrainIntelligence


class SoilProvider(Protocol):
    def profile(self, latitude: float, longitude: float) -> SoilIntelligence: ...


class TerrainProvider(Protocol):
    def profile(
        self,
        latitude: float,
        longitude: float,
        elevation_m: float | None,
    ) -> TerrainIntelligence: ...


class UnavailableSoilProvider:
    def profile(self, latitude: float, longitude: float) -> SoilIntelligence:
        return SoilIntelligence(
            status="Unavailable",
            properties={},
            interpretation=(
                "SoilGrids map layers can show modelled variation around this location, "
                "but a validated numeric point-extraction service is not connected. "
                "Do not make fertilizer or amendment decisions from map color alone."
            ),
            soil_test_checklist=[
                "Collect representative samples from each visibly different field section.",
                "Request pH, texture, organic carbon, nitrogen, phosphorus, potassium, and salinity where relevant.",
                "Record drainage, compaction, and previous crop history with the sample.",
                "Review results with a qualified agronomist or county extension officer.",
            ],
            limitations=[
                "No modelled soil value is substituted for a laboratory test.",
                "The visible SoilGrids layers are 250 m modelled estimates for exploration, not laboratory measurements.",
            ],
        )


@dataclass(frozen=True)
class SoilProperty:
    map_file: str
    layer: str
    label: str
    divisor: float
    unit: str


SOIL_PROPERTIES = (
    SoilProperty("phh2o", "phh2o_0-5cm_mean", "Soil pH", 10, "pH"),
    SoilProperty("clay", "clay_0-5cm_mean", "Clay", 10, "%"),
    SoilProperty("sand", "sand_0-5cm_mean", "Sand", 10, "%"),
    SoilProperty("soc", "soc_0-5cm_mean", "Organic carbon", 10, "g/kg"),
    SoilProperty("nitrogen", "nitrogen_0-5cm_mean", "Total nitrogen", 100, "g/kg"),
    SoilProperty("cec", "cec_0-5cm_mean", "Cation exchange capacity", 1, "mmol(c)/kg"),
    SoilProperty("bdod", "bdod_0-5cm_mean", "Bulk density", 100, "g/cm3"),
)


class SoilGridsSoilProvider:
    endpoint = "https://maps.isric.org/mapserv"

    def __init__(self, timeout_seconds: float = 15.0):
        self.timeout = httpx.Timeout(timeout_seconds)

    async def profile(self, latitude: float, longitude: float) -> SoilIntelligence:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            results = await asyncio.gather(
                *(
                    self._fetch_value(client, soil_property, latitude, longitude)
                    for soil_property in SOIL_PROPERTIES
                )
            )

        values = {
            soil_property.label: f"{value:g} {soil_property.unit}"
            for soil_property, value in zip(SOIL_PROPERTIES, results)
            if value is not None
        }
        missing = [
            soil_property.label
            for soil_property, value in zip(SOIL_PROPERTIES, results)
            if value is None
        ]
        if not values:
            return UnavailableSoilProvider().profile(latitude, longitude)

        numeric_values = {
            soil_property.label: value
            for soil_property, value in zip(SOIL_PROPERTIES, results)
            if value is not None
        }
        limitations = [
            "Values are SoilGrids 250 m modelled estimates for the top 0-5 cm, not laboratory measurements.",
            "A farm may vary substantially within one SoilGrids pixel; sample each visibly different management section.",
        ]
        if missing:
            limitations.append(
                f"No point value was returned for: {', '.join(missing)}."
            )
        return SoilIntelligence(
            status="Available",
            properties=values,
            interpretation=self._interpret(numeric_values),
            soil_test_checklist=[
                "Use these modelled values to plan sampling, not to set fertilizer or lime rates.",
                "Collect representative samples from each visibly different field section.",
                "Request pH, texture, organic carbon, nitrogen, phosphorus, potassium, and salinity where relevant.",
                "Review laboratory results with a qualified agronomist or county extension officer.",
            ],
            source="ISRIC SoilGrids 250 m",
            limitations=limitations,
        )

    async def _fetch_value(
        self,
        client: httpx.AsyncClient,
        soil_property: SoilProperty,
        latitude: float,
        longitude: float,
    ) -> float | None:
        margin = 0.005
        params = {
            "map": f"/map/{soil_property.map_file}.map",
            "SERVICE": "WMS",
            "VERSION": "1.1.1",
            "REQUEST": "GetFeatureInfo",
            "LAYERS": soil_property.layer,
            "QUERY_LAYERS": soil_property.layer,
            "STYLES": "",
            "SRS": "EPSG:4326",
            "BBOX": (
                f"{longitude - margin},{latitude - margin},"
                f"{longitude + margin},{latitude + margin}"
            ),
            "WIDTH": 101,
            "HEIGHT": 101,
            "X": 50,
            "Y": 50,
            "FEATURE_COUNT": 1,
            "INFO_FORMAT": "application/geo+json",
        }
        try:
            response = await client.get(self.endpoint, params=params)
            response.raise_for_status()
            pixel_value = response.json()["features"][0]["properties"]["pixel_value"]
            return round(float(pixel_value) / soil_property.divisor, 2)
        except (
            httpx.HTTPError,
            KeyError,
            IndexError,
            TypeError,
            ValueError,
        ):
            return None

    @staticmethod
    def _interpret(values: dict[str, float]) -> str:
        descriptions: list[str] = []
        ph = values.get("Soil pH")
        if ph is not None:
            if ph < 5.5:
                descriptions.append("strongly acidic")
            elif ph < 6.5:
                descriptions.append("moderately acidic")
            elif ph <= 7.5:
                descriptions.append("near neutral")
            else:
                descriptions.append("alkaline")

        clay = values.get("Clay")
        sand = values.get("Sand")
        if clay is not None:
            descriptions.append(
                "clay-rich"
                if clay >= 40
                else "moderate in clay"
                if clay >= 20
                else "lower in clay"
            )
        if sand is not None:
            descriptions.append(
                "sand-rich"
                if sand >= 70
                else "moderate in sand"
                if sand >= 40
                else "lower in sand"
            )

        organic_carbon = values.get("Organic carbon")
        if organic_carbon is not None:
            descriptions.append(
                "relatively high in modelled organic carbon"
                if organic_carbon >= 20
                else "moderate in modelled organic carbon"
                if organic_carbon >= 10
                else "low in modelled organic carbon"
            )

        summary = ", ".join(descriptions) or "partially described by the available layers"
        return (
            f"SoilGrids models the top 5 cm near this point as {summary}. "
            "Use this as regional screening evidence and confirm field decisions with representative soil samples."
        )


class ModelledElevationTerrainProvider:
    def profile(
        self,
        latitude: float,
        longitude: float,
        elevation_m: float | None,
    ) -> TerrainIntelligence:
        elevation_available = elevation_m is not None
        return TerrainIntelligence(
            elevation_m=elevation_m,
            slope_percent=None,
            terrain_class=(
                "Modelled elevation available; slope not yet available"
                if elevation_available
                else "Elevation and slope are currently unavailable"
            ),
            drainage_interpretation=(
                "Drainage cannot be determined from elevation alone. Observe ponding after rain "
                "and obtain slope or field-survey evidence."
            ),
            erosion_risk="Unknown until slope, soil cover, and runoff evidence are available.",
            mechanization_note="Field access and machinery suitability require slope and ground-condition checks.",
            confidence="Low",
            limitations=[
                (
                    "Elevation is modelled."
                    if elevation_available
                    else "The elevation provider did not return a value for this request."
                ),
                "Slope, flow direction, and drainage are not inferred from one elevation value.",
            ],
        )
