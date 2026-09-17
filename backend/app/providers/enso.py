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

    async def fetch(self, country: str | None = None) -> EnsoTracker:
        now = datetime.now(timezone.utc)
        if (
            self._cached is not None
            and self._cached_at is not None
            and now - self._cached_at <= self.ttl
        ):
            return self._with_region(self._cached, country)

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
            return self._with_region(tracker, country)
        except (httpx.HTTPError, ValueError):
            if self._cached is not None:
                stale = self._cached.model_copy(deep=True)
                stale.stale = True
                stale.limitations.append(
                    "The latest NOAA retrieval failed; cached ENSO data is shown."
                )
                return self._with_region(stale, country)
            return self.unavailable(now, country)

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
            eastern_africa_context=cls._regional_context(
                outlook_phase,
                None,
                first_probability.season,
            )[1],
            regional_location="Eastern Africa",
            regional_season=first_probability.season,
            regional_relationship="Mixed / season-dependent",
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
    def _regional_context(
        outlook_phase: str,
        country: str | None,
        season: str,
    ) -> tuple[str, str]:
        location = country or "the selected Eastern Africa location"
        normalized_country = (country or "").lower()
        short_rains_countries = (
            "kenya",
            "somalia",
            "uganda",
            "rwanda",
            "burundi",
            "tanzania",
        )
        short_rains_seasons = {"SON", "OND", "NDJ"}
        short_rains_relevant = (
            any(name in normalized_country for name in short_rains_countries)
            and season in short_rains_seasons
        )

        if outlook_phase == "El Niño" and short_rains_relevant:
            return (
                "Historically relevant",
                f"For {location}, El Niño has often been associated with wetter short-rains "
                f"conditions around {season} in parts of the country, increasing waterlogging "
                "and flood risk. The relationship varies within the country; confirm it with "
                "the current ICPAC and national seasonal forecast.",
            )
        if outlook_phase == "La Niña" and short_rains_relevant:
            return (
                "Historically relevant",
                f"For {location}, La Niña has often been associated with drier short-rains "
                f"conditions around {season} in parts of the country, increasing water-stress "
                "risk. The relationship varies within the country; confirm it with the current "
                "ICPAC and national seasonal forecast.",
            )
        if outlook_phase == "El Niño":
            return (
                "Mixed / season-dependent",
                "El Niño can increase heavy-rain and flood risk in parts of Eastern Africa "
                f"during some seasons, but the relationship for {location} in {season} is mixed "
                "or not strong enough for a local wet/dry conclusion. Use the current ICPAC and "
                "national seasonal forecast."
            )
        if outlook_phase == "La Niña":
            return (
                "Mixed / season-dependent",
                "La Niña can raise dry-spell and water-stress risk in parts of Eastern Africa "
                f"during some seasons, but the relationship for {location} in {season} is mixed "
                "or not strong enough for a local wet/dry conclusion. Use the current ICPAC and "
                "national seasonal forecast."
            )
        return (
            "Mixed / season-dependent",
            f"Neutral ENSO conditions do not remove seasonal drought or flood risk for {location}. "
            "Use ICPAC and the national meteorological outlook for local rainfall probabilities.",
        )

    @classmethod
    def _with_region(
        cls,
        tracker: EnsoTracker,
        country: str | None,
    ) -> EnsoTracker:
        contextualized = tracker.model_copy(deep=True)
        if contextualized.status == "Unavailable":
            contextualized.regional_location = country or "Eastern Africa"
            return contextualized
        normalized_country = (country or "").lower()
        short_rains_country = any(
            name in normalized_country
            for name in ("kenya", "somalia", "uganda", "rwanda", "burundi", "tanzania")
        )
        season = contextualized.probabilities[0].season
        if short_rains_country:
            season = next(
                (
                    probability.season
                    for probability in contextualized.probabilities
                    if probability.season in {"SON", "OND", "NDJ"}
                ),
                season,
            )
        relationship, context = cls._regional_context(
            contextualized.outlook_phase,
            country,
            season,
        )
        contextualized.regional_location = country or "Eastern Africa"
        contextualized.regional_season = season
        contextualized.regional_relationship = relationship
        contextualized.eastern_africa_context = context
        return contextualized

    @staticmethod
    def unavailable(
        retrieved_at: datetime | None = None,
        country: str | None = None,
    ) -> EnsoTracker:
        return EnsoTracker(
            status="Unavailable",
            outlook_phase="Unavailable",
            observed_phase="Unavailable",
            retrieved_at=retrieved_at or datetime.now(timezone.utc),
            eastern_africa_context=(
                "ENSO data is temporarily unavailable. Do not infer the seasonal phase from local "
                "weather alone."
            ),
            regional_location=country or "Eastern Africa",
            regional_season="Unavailable",
            regional_relationship="Not established",
            confidence="Low",
            source="NOAA Climate Prediction Center",
            source_url=PROBABILITIES_URL,
            regional_source="IGAD Climate Prediction and Applications Centre (ICPAC)",
            regional_source_url=ICPAC_URL,
            limitations=["No ENSO values were substituted while the provider was unavailable."],
        )
