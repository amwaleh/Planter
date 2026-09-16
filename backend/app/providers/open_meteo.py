import asyncio
import calendar
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from time import perf_counter

import httpx

from ..models import (
    ClimateMonth,
    CurrentWeather,
    LocationMatch,
    ProviderHealth,
    RecentDay,
    SourceRecord,
)
from ..region import EAST_AFRICA_COUNTRY_CODES

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"


@dataclass
class OpenMeteoData:
    current: CurrentWeather
    climate: list[ClimateMonth]
    elevation_m: float | None
    forecast_daily: dict[str, list[float]]
    recent_days: list[RecentDay]
    sources: list[SourceRecord]


@dataclass
class CacheEntry:
    stored_at: datetime
    data: OpenMeteoData


class OpenMeteoProvider:
    def __init__(self, timeout_seconds: float = 15.0, ttl_minutes: int = 15) -> None:
        self.timeout = httpx.Timeout(timeout_seconds)
        self.ttl = timedelta(minutes=ttl_minutes)
        self._cache: dict[tuple[float, float], CacheEntry] = {}
        self._cache_hits = 0
        self._last_success_at: datetime | None = None
        self._last_latency_ms: int | None = None
        self._last_error: str | None = None

    async def fetch(self, latitude: float, longitude: float) -> OpenMeteoData:
        key = (round(latitude, 4), round(longitude, 4))
        now = datetime.now(timezone.utc)
        cached = self._cache.get(key)
        if cached and now - cached.stored_at <= self.ttl:
            self._cache_hits += 1
            return cached.data

        started = perf_counter()
        try:
            data = await self._fetch_fresh(latitude, longitude)
        except httpx.HTTPError as error:
            self._last_error = self._safe_error(error)
            if cached:
                self._cache_hits += 1
                age = int((now - cached.stored_at).total_seconds())
                for source in cached.data.sources:
                    source.stale = True
                    source.age_seconds = age
                    if "Fresh provider retrieval failed; this response is cached." not in source.limitations:
                        source.limitations.append(
                            "Fresh provider retrieval failed; this response is cached."
                        )
                return cached.data
            raise

        self._last_latency_ms = round((perf_counter() - started) * 1000)
        self._last_success_at = datetime.now(timezone.utc)
        self._last_error = None
        self._cache[key] = CacheEntry(stored_at=self._last_success_at, data=data)
        return data

    async def fetch_elevation(
        self,
        latitude: float,
        longitude: float,
    ) -> float | None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await self._get_with_retry(
                client,
                ELEVATION_URL,
                {"latitude": latitude, "longitude": longitude},
            )
        values = response.json().get("elevation", [])
        return float(values[0]) if values and values[0] is not None else None

    async def _fetch_fresh(self, latitude: float, longitude: float) -> OpenMeteoData:
        today = date.today()
        archive_start = date(today.year - 10, 1, 1)
        archive_end = today - timedelta(days=1)
        forecast_params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
            "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration",
            "forecast_days": 16,
            "timezone": "Africa/Nairobi",
        }
        archive_params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": archive_start.isoformat(),
            "end_date": archive_end.isoformat(),
            "daily": "precipitation_sum,temperature_2m_mean,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean",
            "timezone": "Africa/Nairobi",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            forecast_response, archive_response = await asyncio.gather(
                self._get_with_retry(client, FORECAST_URL, forecast_params),
                self._get_with_retry(client, ARCHIVE_URL, archive_params),
            )
        forecast = forecast_response.json()
        archive = archive_response.json()
        retrieved_at = datetime.now(timezone.utc)
        current_values = forecast["current"]
        observed_at = datetime.fromisoformat(current_values["time"]).replace(
            tzinfo=timezone(timedelta(hours=3))
        )
        current = CurrentWeather(
            temperature_c=current_values["temperature_2m"],
            humidity_percent=current_values["relative_humidity_2m"],
            precipitation_mm=current_values["precipitation"],
            wind_speed_kmh=current_values["wind_speed_10m"],
            weather_code=current_values["weather_code"],
            observed_at=observed_at,
            retrieved_at=retrieved_at,
            precipitation_meaning="Precipitation reported for the provider's current model interval, not a regional average.",
        )
        climate = self._summarize_climate(archive["daily"], today.year)
        recent_days = self._recent_days(archive["daily"], count=21)
        sources = [
            SourceRecord(
                provider="Open-Meteo Forecast API",
                kind="forecast",
                retrieved_at=retrieved_at,
                confidence="High",
                resolution="Provider-selected numerical weather-model grid cell.",
                limitations=[
                    "Values represent a weather-model grid cell and can differ from this exact field.",
                    "Forecast skill decreases with lead time.",
                ],
            ),
            SourceRecord(
                provider="Open-Meteo Historical Weather API",
                kind="historical",
                retrieved_at=retrieved_at,
                confidence="Medium",
                resolution="Daily gridded reanalysis summarized over ten complete calendar years.",
                limitations=[
                    "Recent and historical values are gridded model/reanalysis data, not an on-farm weather station.",
                    "Expected monthly rainfall uses the previous ten complete calendar years.",
                ],
            ),
            SourceRecord(
                provider="Open-Meteo elevation model",
                kind="modelled",
                retrieved_at=retrieved_at,
                confidence="Medium",
                resolution="Digital elevation model grid cell at the selected coordinate.",
                limitations=["Elevation comes from a digital terrain model, not an on-site survey."],
            ),
        ]
        return OpenMeteoData(
            current=current,
            climate=climate,
            elevation_m=forecast.get("elevation"),
            forecast_daily=forecast["daily"],
            recent_days=recent_days,
            sources=sources,
        )

    async def _get_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: dict[str, object],
    ) -> httpx.Response:
        last_error: httpx.HTTPError | None = None
        for attempt in range(2):
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as error:
                last_error = error
                if attempt == 0:
                    await asyncio.sleep(0.25)
        assert last_error is not None
        raise last_error

    async def search_east_africa(self, query: str) -> list[LocationMatch]:
        params = {
            "name": query,
            "count": 20,
            "language": "en",
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await self._get_with_retry(client, GEOCODING_URL, params)
        return [
            LocationMatch(
                name=result["name"],
                admin1=result.get("admin1"),
                admin2=result.get("admin2"),
                latitude=result["latitude"],
                longitude=result["longitude"],
            )
            for result in response.json().get("results", [])
            if result.get("country_code") in EAST_AFRICA_COUNTRY_CODES
        ]

    def health(self) -> ProviderHealth:
        if self._last_error:
            status = "Degraded"
        elif self._last_success_at:
            status = "Healthy"
        else:
            status = "Unknown"
        return ProviderHealth(
            provider="Open-Meteo",
            status=status,
            cache_entries=len(self._cache),
            cache_hits=self._cache_hits,
            last_success_at=self._last_success_at,
            last_latency_ms=self._last_latency_ms,
            last_error=self._last_error,
        )

    @staticmethod
    def _safe_error(error: httpx.HTTPError) -> str:
        if isinstance(error, httpx.HTTPStatusError):
            return f"Provider returned HTTP {error.response.status_code}."
        if isinstance(error, httpx.TimeoutException):
            return "Provider request timed out."
        if isinstance(error, httpx.NetworkError):
            return "Provider network request failed."
        return "Provider request failed."

    @staticmethod
    def _summarize_climate(
        daily: dict[str, list],
        current_year: int,
    ) -> list[ClimateMonth]:
        historical_rainfall: dict[int, dict[int, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        historical_temperature: dict[int, list[float]] = defaultdict(list)
        current_rainfall: dict[int, float] = defaultdict(float)
        for day, rainfall, temperature in zip(
            daily["time"],
            daily["precipitation_sum"],
            daily["temperature_2m_mean"],
            strict=True,
        ):
            parsed = date.fromisoformat(day)
            if parsed.year == current_year:
                if rainfall is not None:
                    current_rainfall[parsed.month] += float(rainfall)
                continue
            if rainfall is not None:
                historical_rainfall[parsed.month][parsed.year] += float(rainfall)
            if temperature is not None:
                historical_temperature[parsed.month].append(float(temperature))

        today = date.today()
        return [
            ClimateMonth(
                month=calendar.month_abbr[month],
                rainfall_mm=round(
                    sum(historical_rainfall[month].values())
                    / max(1, len(historical_rainfall[month])),
                    1,
                ),
                mean_temperature_c=round(
                    sum(historical_temperature[month])
                    / max(1, len(historical_temperature[month])),
                    1,
                ),
                current_year_rainfall_mm=(
                    round(current_rainfall[month], 1)
                    if month <= today.month and month in current_rainfall
                    else None
                ),
                current_year_complete=month < today.month,
            )
            for month in range(1, 13)
        ]

    @staticmethod
    def _recent_days(daily: dict[str, list], count: int) -> list[RecentDay]:
        start = max(0, len(daily["time"]) - count)
        return [
            RecentDay(
                date=daily["time"][index],
                rainfall_mm=float(daily["precipitation_sum"][index] or 0),
                temperature_min_c=float(daily["temperature_2m_min"][index]),
                temperature_max_c=float(daily["temperature_2m_max"][index]),
                humidity_percent=(
                    float(daily["relative_humidity_2m_mean"][index])
                    if daily["relative_humidity_2m_mean"][index] is not None
                    else None
                ),
            )
            for index in range(start, len(daily["time"]))
        ]
