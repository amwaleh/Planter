import asyncio
import html
import re
from datetime import datetime, timezone
from time import monotonic

import httpx

from ..models import CropImageMetadata

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"


def _plain_text(value: str | None) -> str:
    return re.sub(r"<[^>]+>", "", html.unescape(value or "")).strip()


class WikimediaImageProvider:
    def __init__(self, timeout_seconds: float = 15.0) -> None:
        self.timeout = httpx.Timeout(timeout_seconds)
        self._request_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def _get(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: dict[str, object],
    ) -> httpx.Response:
        async with self._request_lock:
            elapsed = monotonic() - self._last_request_at
            if elapsed < 0.3:
                await asyncio.sleep(0.3 - elapsed)
            for attempt in range(3):
                response = await client.get(url, params=params)
                self._last_request_at = monotonic()
                if response.status_code != 429 or attempt == 2:
                    response.raise_for_status()
                    return response
                retry_after = min(float(response.headers.get("Retry-After", "1")), 3.0)
                await asyncio.sleep(max(0.5, retry_after))
        raise RuntimeError("Wikimedia request retry loop ended unexpectedly.")

    async def fetch(self, crop_name: str, wikipedia_title: str) -> CropImageMetadata | None:
        async with httpx.AsyncClient(
            timeout=self.timeout,
            headers={"User-Agent": "Planter/0.1 (farm crop catalog)"},
        ) as client:
            page_response = await self._get(
                client,
                WIKIPEDIA_API,
                {
                    "action": "query",
                    "titles": wikipedia_title,
                    "prop": "pageimages|info",
                    "piprop": "thumbnail|name",
                    "pithumbsize": 480,
                    "inprop": "url",
                    "redirects": 1,
                    "format": "json",
                },
            )
            pages = page_response.json().get("query", {}).get("pages", {})
            page = next(iter(pages.values()), None)
            if not page or not page.get("thumbnail", {}).get("source"):
                return None

            creator = "Wikimedia contributor"
            license_name = "See source page"
            license_url = None
            source_page_url = page.get("fullurl")
            page_image = page.get("pageimage")
            if page_image:
                image_response = await self._get(
                    client,
                    COMMONS_API,
                    {
                        "action": "query",
                        "titles": f"File:{page_image}",
                        "prop": "imageinfo",
                        "iiprop": "url|extmetadata",
                        "iiurlwidth": 480,
                        "format": "json",
                    },
                )
                image_pages = image_response.json().get("query", {}).get("pages", {})
                image_page = next(iter(image_pages.values()), None) or {}
                image_info = (image_page.get("imageinfo") or [{}])[0]
                metadata = image_info.get("extmetadata", {})
                creator = _plain_text(metadata.get("Artist", {}).get("value")) or creator
                license_name = (
                    _plain_text(metadata.get("LicenseShortName", {}).get("value"))
                    or license_name
                )
                license_url = metadata.get("LicenseUrl", {}).get("value") or None
                source_page_url = image_info.get("descriptionurl") or source_page_url

            if not source_page_url:
                return None
            return CropImageMetadata(
                crop_name=crop_name,
                image_url=page["thumbnail"]["source"],
                source_page_url=source_page_url,
                creator=creator,
                license=license_name,
                license_url=license_url,
                alt_text=f"{crop_name} plant or produce",
                retrieved_at=datetime.now(timezone.utc),
            )
