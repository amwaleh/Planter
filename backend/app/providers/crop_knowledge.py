from typing import Protocol

from ..models import LocationContext


class CropKnowledgeProvider(Protocol):
    def calendar_status(self, crop: str, location: LocationContext) -> str: ...


class UnavailableRegionalCalendarProvider:
    def calendar_status(self, crop: str, location: LocationContext) -> str:
        area = location.county or location.place or "this location"
        return (
            f"An authoritative {area} planting calendar for {crop} is not connected. "
            "Treat the guidance above as general context and confirm the season, variety, "
            "rainfall onset, and maturity period with KALRO or a county extension officer."
        )
