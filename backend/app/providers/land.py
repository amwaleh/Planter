from typing import Protocol

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
                "Coordinate-level soil estimates are not currently connected. "
                "Do not make fertilizer or amendment decisions from climate and elevation."
            ),
            soil_test_checklist=[
                "Collect representative samples from each visibly different field section.",
                "Request pH, texture, organic carbon, nitrogen, phosphorus, potassium, and salinity where relevant.",
                "Record drainage, compaction, and previous crop history with the sample.",
                "Review results with a qualified agronomist or county extension officer.",
            ],
            limitations=[
                "No modelled soil value is substituted for a laboratory test.",
                "KALRO and stable SoilGrids distribution options require provider validation.",
            ],
        )


class ModelledElevationTerrainProvider:
    def profile(
        self,
        latitude: float,
        longitude: float,
        elevation_m: float | None,
    ) -> TerrainIntelligence:
        return TerrainIntelligence(
            elevation_m=elevation_m,
            slope_percent=None,
            terrain_class="Elevation available; slope not yet available",
            drainage_interpretation=(
                "Drainage cannot be determined from elevation alone. Observe ponding after rain "
                "and obtain slope or field-survey evidence."
            ),
            erosion_risk="Unknown until slope, soil cover, and runoff evidence are available.",
            mechanization_note="Field access and machinery suitability require slope and ground-condition checks.",
            confidence="Low",
            limitations=[
                "Elevation is modelled.",
                "Slope, flow direction, and drainage are not inferred from one elevation value.",
            ],
        )
