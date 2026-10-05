"""Tavily-backed web search tool used by Chat mode and the Agent ReAct loop."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List, Optional

try:
    from tavily import UsageLimitExceededError
except ImportError:  # pragma: no cover - supports installs without optional Tavily.
    class UsageLimitExceededError(Exception):
        """Fallback used until the optional Tavily package is installed."""


logger = logging.getLogger(__name__)

__all__ = ["WebSearchError", "tavily_search"]

_MAX_TITLE_CHARS = 300
_MAX_URL_CHARS = 2_048
_MAX_SNIPPET_CHARS = 1_000
_MAX_CONTENT_CHARS = 8_000
_MAX_RESULTS = 10
_PROVIDER_ERROR = "Web search provider unavailable."
_RETRY_BASE_DELAY_SECONDS = 0.25


class WebSearchError(RuntimeError):
    """Raised when the web search provider cannot answer the query."""


def _is_transient_error(exc: Exception) -> bool:
    if isinstance(exc, UsageLimitExceededError):
        return True
    status_code = getattr(getattr(exc, "response", None), "status_code", None)
    return isinstance(status_code, int) and (
        status_code == 429 or 500 <= status_code <= 599
    )


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
        ValueError: ``max_results`` is not a positive integer.
        WebSearchError: Missing ``TAVILY_API_KEY``, API failure, or malformed
            response.
    """
    if (
        isinstance(max_results, bool)
        or not isinstance(max_results, int)
        or max_results <= 0
    ):
        raise ValueError("max_results must be a positive integer.")
    safe_max_results = min(max_results, _MAX_RESULTS)

    cleaned = (query or "").strip()
    if not cleaned:
        return []

    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        logger.error("TAVILY_API_KEY is not configured")
        raise WebSearchError(_PROVIDER_ERROR)

    try:
        client = _build_client(api_key)
        for attempt in range(2):
            try:
                response = client.search(
                    cleaned,
                    max_results=safe_max_results,
                    search_depth=search_depth,
                )
                break
            except Exception as exc:
                if attempt == 0 and _is_transient_error(exc):
                    logger.warning("Transient Tavily search failure; retrying", exc_info=True)
                    time.sleep(_RETRY_BASE_DELAY_SECONDS * (2**attempt))
                    continue
                raise
    except WebSearchError:
        raise
    except Exception as exc:
        logger.warning("Tavily search failed", exc_info=True)
        raise WebSearchError(_PROVIDER_ERROR) from exc

    raw_results: Optional[List[Dict[str, Any]]] = None
    if isinstance(response, dict):
        raw_results = response.get("results")
    if not isinstance(raw_results, list):
        logger.warning("Tavily returned a malformed response without a results list")
        raise WebSearchError(_PROVIDER_ERROR)
    if any(not isinstance(item, dict) for item in raw_results):
        logger.warning("Tavily returned a malformed result item")
        raise WebSearchError(_PROVIDER_ERROR)

    normalized: List[Dict[str, Any]] = []
    for item in raw_results[:safe_max_results]:
        normalized.append(
            {
                "title": str(item.get("title") or "").strip()[:_MAX_TITLE_CHARS],
                "url": str(item.get("url") or "").strip()[:_MAX_URL_CHARS],
                "snippet": str(item.get("snippet") or "").strip()[:_MAX_SNIPPET_CHARS],
                "content": str(item.get("content") or "").strip()[:_MAX_CONTENT_CHARS],
            }
        )
    return normalized
