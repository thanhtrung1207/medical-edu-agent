"""Fetch a URL and return cleaned readable text for the Agent ReAct loop."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

__all__ = ["UrlReadError", "read_url"]

MAX_CHARS = 8000
_TIMEOUT_SECONDS = 10.0


class UrlReadError(RuntimeError):
    """Raised when a URL cannot be fetched or parsed as HTML."""


def _http_get(url: str, **kwargs: Any) -> httpx.Response:
    """Perform the HTTP GET. Isolated so tests can monkeypatch it."""
    return httpx.get(
        url,
        timeout=_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": "medical-edu-agent/1.0 (+https://unident.local)"},
        **kwargs,
    )


def _readable_html(html: str) -> str:
    """Run readability on the raw HTML. Isolated for monkeypatching in tests."""
    from readability import Document

    return Document(html).summary(html_partial=True)


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(html: str) -> str:
    """Strip tags and collapse whitespace."""
    text = _TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()
    return text


def read_url(url: str) -> str:
    """Fetch ``url`` and return cleaned readable text (<= MAX_CHARS).

    Raises:
        UrlReadError: Empty URL, fetch failure, non-HTML content type, or
            empty extraction result.
    """
    cleaned = (url or "").strip()
    if not cleaned:
        raise UrlReadError("URL rỗng.")

    try:
        response = _http_get(cleaned)
    except Exception as exc:
        logger.warning("URL fetch failed: %s", exc)
        raise UrlReadError(f"Không thể tải URL: {exc}") from exc

    try:
        response.raise_for_status()
    except Exception as exc:
        raise UrlReadError(f"HTTP lỗi khi tải {cleaned}: {exc}") from exc

    content_type = (response.headers.get("content-type") or "").lower()
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        raise UrlReadError(
            f"Content-Type không phải HTML ({content_type or 'unknown'})."
        )

    try:
        readable = _readable_html(response.text)
    except Exception as exc:
        raise UrlReadError(f"Lỗi khi parse HTML: {exc}") from exc

    text = _strip_html(readable)
    if not text:
        raise UrlReadError("Trang không có nội dung đọc được.")
    return text[:MAX_CHARS]
