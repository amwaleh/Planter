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
