import asyncio
import calendar
from collections import defaultdict
from datetime import date, datetime, timezone

import httpx

from ..models import ClimateMonth, CurrentWeather, LocationMatch, SourceRecord

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"


class OpenMeteoProvider:
    def __init__(self, timeout_seconds: float = 15.0) -> None:
        self.timeout = httpx.Timeout(timeout_seconds)

    async def fetch(
        self, latitude: float, longitude: float
    ) -> tuple[
        CurrentWeather,
        list[ClimateMonth],
        float | None,
        dict[str, list[float]],
        list[SourceRecord],
    ]:
        today = date.today()
        end_date = today.replace(year=today.year - 1)
        start_date = end_date.replace(year=end_date.year - 5)
        forecast_params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
            "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
            "forecast_days": 16,
            "timezone": "Africa/Nairobi",
        }
        archive_params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "daily": "precipitation_sum,temperature_2m_mean",
            "timezone": "Africa/Nairobi",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            forecast_response, archive_response = await asyncio.gather(
                client.get(FORECAST_URL, params=forecast_params),
                client.get(ARCHIVE_URL, params=archive_params),
            )
        forecast_response.raise_for_status()
        archive_response.raise_for_status()
        forecast = forecast_response.json()
        archive = archive_response.json()
        retrieved_at = datetime.now(timezone.utc)

        current_values = forecast["current"]
        current = CurrentWeather(
            temperature_c=current_values["temperature_2m"],
            humidity_percent=current_values["relative_humidity_2m"],
            precipitation_mm=current_values["precipitation"],
            wind_speed_kmh=current_values["wind_speed_10m"],
            weather_code=current_values["weather_code"],
        )
        climate = self._summarize_climate(archive["daily"])
        sources = [
            SourceRecord(
                provider="Open-Meteo Forecast API",
                kind="forecast",
                retrieved_at=retrieved_at,
                confidence="High",
                limitations=[
                    "Numerical forecast skill decreases with lead time.",
                    "Grid-cell values may not capture farm-scale conditions.",
                ],
            ),
            SourceRecord(
                provider="Open-Meteo Historical Weather API",
                kind="historical",
                retrieved_at=retrieved_at,
                confidence="Medium",
                limitations=[
                    "Historical values are gridded reanalysis/model data, not an on-farm weather station.",
                    "The prototype summarizes the previous five complete years.",
                ],
            ),
            SourceRecord(
                provider="Open-Meteo elevation model",
                kind="modelled",
                retrieved_at=retrieved_at,
                confidence="Medium",
                limitations=["Elevation is modelled at the provider grid resolution."],
            ),
        ]
        return current, climate, forecast.get("elevation"), forecast["daily"], sources

    async def search_kenya(self, query: str) -> list[LocationMatch]:
        params = {
            "name": query,
            "count": 6,
            "language": "en",
            "countryCode": "KE",
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(GEOCODING_URL, params=params)
        response.raise_for_status()
        return [
            LocationMatch(
                name=result["name"],
                admin1=result.get("admin1"),
                admin2=result.get("admin2"),
                latitude=result["latitude"],
                longitude=result["longitude"],
            )
            for result in response.json().get("results", [])
            if result.get("country_code") == "KE"
        ]

    @staticmethod
    def _summarize_climate(daily: dict[str, list]) -> list[ClimateMonth]:
        rainfall_by_month: dict[int, list[float]] = defaultdict(list)
        temperature_by_month: dict[int, list[float]] = defaultdict(list)
        for day, rainfall, temperature in zip(
            daily["time"],
            daily["precipitation_sum"],
            daily["temperature_2m_mean"],
            strict=True,
        ):
            month = date.fromisoformat(day).month
            if rainfall is not None:
                rainfall_by_month[month].append(float(rainfall))
            if temperature is not None:
                temperature_by_month[month].append(float(temperature))

        years = max(1, len({value[:4] for value in daily["time"]}))
        return [
            ClimateMonth(
                month=calendar.month_abbr[month],
                rainfall_mm=round(sum(rainfall_by_month[month]) / years, 1),
                mean_temperature_c=round(
                    sum(temperature_by_month[month])
                    / max(1, len(temperature_by_month[month])),
                    1,
                ),
            )
            for month in range(1, 13)
        ]
