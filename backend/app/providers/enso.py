import asyncio
import html
import re
from datetime import datetime, timedelta, timezone

import httpx

from ..models import EnsoObservation, EnsoProbability, EnsoTracker

PROBABILITIES_URL = (
    "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/"
    "enso/roni/probabilities/"
)
ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
ICPAC_URL = "https://www.icpac.net/seasonal-forecast/"

ISSUED_PATTERN = re.compile(r"<h2>\s*Issued\s+([^<]+)</h2>", re.IGNORECASE)
PROBABILITY_ROW_PATTERN = re.compile(
    r"<tr>\s*<th[^>]*>\s*<abbr>([A-Z]{3})\s+.*?</abbr>\s*</th>"
    r"\s*<td>(\d+)</td>\s*<td>(\d+)</td>\s*<td>(\d+)</td>\s*</tr>",
    re.IGNORECASE | re.DOTALL,
)


class EnsoProvider:
    def __init__(self, timeout_seconds: float = 20.0, ttl_hours: int = 6):
        self.timeout = httpx.Timeout(timeout_seconds)
        self.ttl = timedelta(hours=ttl_hours)
        self._cached: EnsoTracker | None = None
        self._cached_at: datetime | None = None

    async def fetch(self) -> EnsoTracker:
        now = datetime.now(timezone.utc)
        if (
            self._cached is not None
            and self._cached_at is not None
            and now - self._cached_at <= self.ttl
        ):
            return self._cached

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                probabilities_response, oni_response = await self._fetch_sources(client)
            tracker = self._build_tracker(
                probabilities_response.text,
                oni_response.text,
                now,
            )
            self._cached = tracker
            self._cached_at = now
            return tracker
        except (httpx.HTTPError, ValueError):
            if self._cached is not None:
                stale = self._cached.model_copy(deep=True)
                stale.stale = True
                stale.limitations.append(
                    "The latest NOAA retrieval failed; cached ENSO data is shown."
                )
                return stale
            return self.unavailable(now)

    async def _fetch_sources(
        self,
        client: httpx.AsyncClient,
    ) -> tuple[httpx.Response, httpx.Response]:
        probabilities_response, oni_response = await asyncio.gather(
            client.get(PROBABILITIES_URL),
            client.get(ONI_URL),
        )
        probabilities_response.raise_for_status()
        oni_response.raise_for_status()
        return probabilities_response, oni_response

    @classmethod
    def _build_tracker(
        cls,
        probabilities_html: str,
        oni_text: str,
        retrieved_at: datetime,
    ) -> EnsoTracker:
        issued_match = ISSUED_PATTERN.search(probabilities_html)
        probabilities = [
            EnsoProbability(
                season=season.upper(),
                la_nina_percent=int(la_nina),
                neutral_percent=int(neutral),
                el_nino_percent=int(el_nino),
            )
            for season, la_nina, neutral, el_nino in PROBABILITY_ROW_PATTERN.findall(
                probabilities_html
            )
        ]
        observations = cls._parse_oni(oni_text)
        if issued_match is None or not probabilities or not observations:
            raise ValueError("NOAA ENSO data did not match the expected format.")

        first_probability = probabilities[0]
        phase_scores = {
            "La Niña": first_probability.la_nina_percent,
            "Neutral": first_probability.neutral_percent,
            "El Niño": first_probability.el_nino_percent,
        }
        outlook_phase = max(phase_scores, key=phase_scores.get)
        latest = observations[-1]
        if latest.anomaly_c >= 0.5:
            observed_phase = "El Niño signal"
        elif latest.anomaly_c <= -0.5:
            observed_phase = "La Niña signal"
        else:
            observed_phase = "Neutral signal"

        return EnsoTracker(
            status="Available",
            outlook_phase=outlook_phase,
            observed_phase=observed_phase,
            issued=html.unescape(issued_match.group(1)).strip(),
            retrieved_at=retrieved_at,
            latest_observation=latest,
            observations=observations[-12:],
            probabilities=probabilities[:9],
            eastern_africa_context=cls._regional_context(outlook_phase),
            confidence="Medium",
            source="NOAA Climate Prediction Center",
            source_url=PROBABILITIES_URL,
            regional_source="IGAD Climate Prediction and Applications Centre (ICPAC)",
            regional_source_url=ICPAC_URL,
            limitations=[
                "ENSO describes tropical Pacific conditions and changes seasonal odds; it is not a farm-level rainfall forecast.",
                "Eastern Africa impacts vary by country, sub-region, rainfall season, and other climate drivers.",
                "Use ICPAC and national meteorological seasonal outlooks before changing planting or livestock plans.",
            ],
        )

    @staticmethod
    def _parse_oni(oni_text: str) -> list[EnsoObservation]:
        observations: list[EnsoObservation] = []
        for line in oni_text.splitlines():
            fields = line.split()
            if len(fields) != 4 or fields[0] == "SEAS":
                continue
            try:
                observations.append(
                    EnsoObservation(
                        season=fields[0],
                        year=int(fields[1]),
                        anomaly_c=float(fields[3]),
                    )
                )
            except ValueError:
                continue
        return observations

    @staticmethod
    def _regional_context(outlook_phase: str) -> str:
        if outlook_phase == "El Niño":
            return (
                "El Niño can increase heavy-rain and flood risk in parts of Eastern Africa "
                "during some seasons, while other areas or seasons may be drier. Protect drainage "
                "and stored harvests, but confirm the selected area's outlook with ICPAC and the "
                "national meteorological service."
            )
        if outlook_phase == "La Niña":
            return (
                "La Niña can raise dry-spell and water-stress risk in parts of Eastern Africa "
                "during some seasons, but effects are not uniform. Review water access, drought "
                "tolerance, and the selected area's ICPAC and national seasonal outlook."
            )
        return (
            "Neutral ENSO conditions do not remove seasonal drought or flood risk. Use ICPAC and "
            "the national meteorological outlook for the selected area's rainfall probabilities."
        )

    @staticmethod
    def unavailable(retrieved_at: datetime | None = None) -> EnsoTracker:
        return EnsoTracker(
            status="Unavailable",
            outlook_phase="Unavailable",
            observed_phase="Unavailable",
            retrieved_at=retrieved_at or datetime.now(timezone.utc),
            eastern_africa_context=(
                "ENSO data is temporarily unavailable. Do not infer the seasonal phase from local "
                "weather alone."
            ),
            confidence="Low",
            source="NOAA Climate Prediction Center",
            source_url=PROBABILITIES_URL,
            regional_source="IGAD Climate Prediction and Applications Centre (ICPAC)",
            regional_source_url=ICPAC_URL,
            limitations=["No ENSO values were substituted while the provider was unavailable."],
        )
