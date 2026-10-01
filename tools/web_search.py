"""Tavily-backed web search tool used by Chat mode and the Agent ReAct loop."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

__all__ = ["WebSearchError", "tavily_search"]


class WebSearchError(RuntimeError):
    """Raised when the web search provider cannot answer the query."""


def _build_client(api_key: str):
    """Construct a Tavily client. Isolated so tests can monkeypatch it."""
    from tavily import TavilyClient  # Imported lazily; package is optional at import time.

    return TavilyClient(api_key=api_key)


def tavily_search(
    query: str,
    max_results: int = 5,
    search_depth: str = "advanced",
) -> List[Dict[str, Any]]:
    """Run one Tavily search and return normalized results.

    Args:
        query: The natural-language query.
        max_results: Upper bound on results returned to the caller.
        search_depth: ``"basic"`` or ``"advanced"`` — passed through to Tavily.

    Returns:
        A list of ``{title, url, snippet, content}`` dicts. Empty when the
        query is blank.

    Raises:
        WebSearchError: Missing ``TAVILY_API_KEY``, API failure, or malformed
            response.
    """
    cleaned = (query or "").strip()
    if not cleaned:
        return []

    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise WebSearchError(
            "TAVILY_API_KEY chưa được cấu hình. Không thể gọi web search."
        )

    try:
        client = _build_client(api_key)
        response = client.search(
            cleaned,
            max_results=max_results,
            search_depth=search_depth,
        )
    except WebSearchError:
        raise
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        raise WebSearchError(f"Tavily search failed: {exc}") from exc

    raw_results: Optional[List[Dict[str, Any]]] = None
    if isinstance(response, dict):
        raw_results = response.get("results")
    if not isinstance(raw_results, list):
        raise WebSearchError("Phản hồi từ Tavily không có trường 'results'.")

    normalized: List[Dict[str, Any]] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("url") or "").strip(),
                "snippet": str(item.get("snippet") or "").strip(),
                "content": str(item.get("content") or "").strip(),
            }
        )
    return normalized
