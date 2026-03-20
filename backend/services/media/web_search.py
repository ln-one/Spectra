"""Web search service for network resource fetching.

Supports Tavily and Bing Search APIs with fallback mechanisms.
"""

import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)


class WebSearchService:
    """Web search service with multiple provider support."""

    def __init__(self):
        self.tavily_api_key = os.getenv("TAVILY_API_KEY")
        self.bing_api_key = os.getenv("BING_SEARCH_API_KEY")
        self.timeout = 10.0

    async def search(
        self,
        query: str,
        *,
        max_results: int = 10,
        search_depth: str = "basic",
    ) -> list[dict[str, Any]]:
        """Search the web using available providers.

        Args:
            query: Search query string
            max_results: Maximum number of results to return
            search_depth: Search depth ("basic" or "advanced")

        Returns:
            List of search results with title, url, content
        """
        if self.tavily_api_key:
            try:
                return await self._search_tavily(
                    query, max_results=max_results, search_depth=search_depth
                )
            except Exception as e:
                logger.warning("Tavily search failed: %s, trying Bing", e)

        if self.bing_api_key:
            try:
                return await self._search_bing(query, max_results=max_results)
            except Exception as e:
                logger.error("Bing search also failed: %s", e)

        logger.error("No search API configured or all providers failed")
        return []

    async def _search_tavily(
        self,
        query: str,
        *,
        max_results: int = 10,
        search_depth: str = "basic",
    ) -> list[dict[str, Any]]:
        """Search using Tavily API."""
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": self.tavily_api_key,
            "query": query,
            "max_results": max_results,
            "search_depth": search_depth,
            "include_answer": False,
            "include_raw_content": False,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        results = []
        for idx, item in enumerate(data.get("results", []), start=1):
            results.append(
                {
                    "id": f"tavily-{idx}",
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "content": item.get("content", ""),
                    "score": item.get("score", 0.0),
                }
            )
        return results

    async def _search_bing(
        self, query: str, *, max_results: int = 10
    ) -> list[dict[str, Any]]:
        """Search using Bing Search API."""
        url = "https://api.bing.microsoft.com/v7.0/search"
        headers = {"Ocp-Apim-Subscription-Key": self.bing_api_key}
        params = {"q": query, "count": max_results, "textDecorations": False}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

        results = []
        for idx, item in enumerate(data.get("webPages", {}).get("value", []), start=1):
            results.append(
                {
                    "id": f"bing-{idx}",
                    "title": item.get("name", ""),
                    "url": item.get("url", ""),
                    "content": item.get("snippet", ""),
                    "score": 1.0 - (idx * 0.05),  # Simple ranking score
                }
            )
        return results

    async def fetch_url_content(
        self, url: str, *, max_length: int = 10000
    ) -> Optional[str]:
        """Fetch and extract text content from a URL.

        Args:
            url: URL to fetch
            max_length: Maximum content length to return

        Returns:
            Extracted text content or None if failed
        """
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout, follow_redirects=True
            ) as client:
                response = await client.get(url)
                response.raise_for_status()

                # Simple text extraction (could be enhanced with BeautifulSoup)
                content_type = response.headers.get("content-type", "")
                if "text/html" in content_type:
                    # Basic HTML stripping (naive approach)
                    text = response.text
                    # Remove script and style tags
                    import re

                    text = re.sub(
                        r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL
                    )
                    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
                    # Remove HTML tags
                    text = re.sub(r"<[^>]+>", " ", text)
                    # Normalize whitespace
                    text = re.sub(r"\s+", " ", text).strip()
                    return text[:max_length]
                elif "text/plain" in content_type:
                    return response.text[:max_length]
                else:
                    logger.warning("Unsupported content type: %s", content_type)
                    return None
        except Exception as e:
            logger.warning("Failed to fetch URL %s: %s", url, e)
            return None


# Singleton instance
web_search_service = WebSearchService()
