"""Fetch a URL and return cleaned readable text for the Agent ReAct loop.

Hardened against SSRF and oversize payloads: blocks non-HTTP schemes,
private/loopback/link-local/metadata hosts, caps response bytes, and
validates every redirect hop. User-facing error messages never embed the
URL or raw httpx exception strings — details go to the logger only.
"""

from __future__ import annotations

import contextlib
import ipaddress
import logging
import re
import socket
import urllib.parse
from typing import Iterator

import httpx

logger = logging.getLogger(__name__)

__all__ = ["UrlReadError", "read_url"]

MAX_CHARS = 8000
MAX_BYTES = 2_000_000  # 2 MB cap on raw response body
_TIMEOUT_SECONDS = 10.0
_MAX_REDIRECTS = 3
_USER_AGENT = "medical-edu-agent/1.0 (+https://unident.local)"

# Cheap literal blocklist (defense in depth; the IP check also catches these
# once resolved, but a literal match avoids a DNS round-trip and tolerates
# split-horizon DNS).
_BLOCKED_HOSTS = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "ip6-localhost",
        "metadata",
        "metadata.google.internal",
        "metadata.goog",
    }
)


class UrlReadError(RuntimeError):
    """Raised when a URL cannot be fetched or parsed as HTML."""


def _resolve_host(host: str) -> list[str]:
    """Resolve ``host`` to all A + AAAA addresses. Monkeypatchable in tests."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        logger.warning("DNS resolution failed", exc_info=True)
        raise UrlReadError("Không thể phân giải tên miền.") from exc
    out: list[str] = []
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        addr = sockaddr[0]
        if "%" in addr:  # strip IPv6 scope id (e.g. fe80::1%en0)
            addr = addr.split("%", 1)[0]
        out.append(addr)
    return out


def _is_blocked_ip(ip: ipaddress._BaseAddress) -> bool:
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _validate_url_or_raise(url: str) -> None:
    """Validate scheme + host (including DNS resolution) before any network use."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UrlReadError("URL không phải HTTP/HTTPS.")

    host = (parts.hostname or "").strip()
    if not host:
        raise UrlReadError("URL không hợp lệ.")

    if host.lower() in _BLOCKED_HOSTS:
        raise UrlReadError("URL không được phép (chặn truy cập nội bộ).")

    # If the host is already a literal IP, validate it directly without DNS.
    try:
        literal_ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        if _is_blocked_ip(literal_ip):
            raise UrlReadError("URL không được phép (chặn truy cập nội bộ).")
        return

    addresses = _resolve_host(host)
    if not addresses:
        raise UrlReadError("Không thể phân giải tên miền.")
    for addr in addresses:
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            # Unknown address family — refuse rather than allow by default.
            raise UrlReadError("URL không được phép (chặn truy cập nội bộ).")
        if _is_blocked_ip(ip):
            raise UrlReadError("URL không được phép (chặn truy cập nội bộ).")


@contextlib.contextmanager
def _open_stream(url: str):
    """Open an httpx streaming GET. Monkeypatchable in tests."""
    with httpx.stream(
        "GET",
        url,
        timeout=_TIMEOUT_SECONDS,
        follow_redirects=False,
        headers={"User-Agent": _USER_AGENT},
    ) as resp:
        yield resp


def _fetch_html(url: str) -> str:
    """Fetch HTML with SSRF guard, size cap, and manual redirect validation."""
    current_url = url
    for _ in range(_MAX_REDIRECTS + 1):
        _validate_url_or_raise(current_url)
        with _open_stream(current_url) as resp:
            status = resp.status_code
            if 300 <= status < 400:
                location = resp.headers.get("location")
                if not location:
                    raise UrlReadError(f"HTTP {status}.")
                current_url = urllib.parse.urljoin(current_url, location)
                continue
            if status >= 400:
                raise UrlReadError(f"HTTP {status}.")

            content_type = (resp.headers.get("content-type") or "").lower()
            if "text/html" not in content_type and "application/xhtml" not in content_type:
                raise UrlReadError(
                    f"Content-Type không phải HTML ({content_type or 'unknown'})."
                )

            buf = bytearray()
            iterator: Iterator[bytes] = resp.iter_bytes()
            for chunk in iterator:
                if not chunk:
                    continue
                buf.extend(chunk)
                if len(buf) > MAX_BYTES:
                    raise UrlReadError("URL vượt quá kích thước cho phép.")
            encoding = getattr(resp, "encoding", None) or "utf-8"
            try:
                return bytes(buf).decode(encoding, errors="replace")
            except LookupError:
                return bytes(buf).decode("utf-8", errors="replace")

    raise UrlReadError("Quá nhiều redirect.")


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
        UrlReadError: Empty URL, blocked target, fetch failure, non-HTML
            content type, oversize response, or empty extraction result.
    """
    cleaned = (url or "").strip()
    if not cleaned:
        raise UrlReadError("URL rỗng.")

    try:
        html = _fetch_html(cleaned)
    except UrlReadError:
        raise
    except Exception:
        logger.warning("URL fetch failed", exc_info=True)
        raise UrlReadError("Không thể tải URL.") from None

    try:
        readable = _readable_html(html)
    except Exception:
        logger.warning("HTML parse failed", exc_info=True)
        raise UrlReadError("Không thể đọc nội dung HTML.") from None

    text = _strip_html(readable)
    if not text:
        raise UrlReadError("Trang không có nội dung đọc được.")
    return text[:MAX_CHARS]
