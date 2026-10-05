"""Fetch a URL and return cleaned readable text for the Agent ReAct loop.

Hardened against SSRF and oversize payloads: blocks non-HTTP schemes,
private/loopback/link-local/metadata hosts, caps response bytes, and
validates every redirect hop. User-facing error messages never embed the
URL or raw httpx exception strings — details go to the logger only.
"""

from __future__ import annotations

import concurrent.futures
import contextlib
import contextvars
import ipaddress
import logging
import re
import socket
import time
import urllib.parse
import urllib.robotparser
from typing import Callable, Iterator, Optional

import httpx

logger = logging.getLogger(__name__)

__all__ = ["UrlReadError", "read_url"]

MAX_CHARS = 8000
MAX_BYTES = 2_000_000  # 2 MB cap on raw response body
_ROBOTS_MAX_BYTES = 512_000
_TIMEOUT_SECONDS = 10.0
_TOTAL_DEADLINE_SECONDS = 10.0
_MAX_REDIRECTS = 3
_USER_AGENT = "medical-edu-agent/1.0 (+https://unident.local)"
_ACTIVE_DEADLINE: contextvars.ContextVar[Optional[float]] = contextvars.ContextVar(
    "url_reader_deadline", default=None
)
_DNS_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="url-reader-dns"
)
_FETCH_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=8, thread_name_prefix="url-reader-fetch"
)
_NAT64_NETWORKS = (
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("64:ff9b:1::/48"),
)

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


def _remaining_timeout_seconds() -> float:
    deadline = _ACTIVE_DEADLINE.get()
    if deadline is None:
        return _TIMEOUT_SECONDS
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise UrlReadError("Không thể tải URL.")
    return min(_TIMEOUT_SECONDS, remaining)


def _resolve_host(host: str) -> list[str]:
    """Resolve ``host`` to all A + AAAA addresses. Monkeypatchable in tests."""
    timeout = _remaining_timeout_seconds()
    future = _DNS_EXECUTOR.submit(socket.getaddrinfo, host, None)
    try:
        infos = future.result(timeout=timeout)
    except concurrent.futures.TimeoutError as exc:
        future.cancel()
        logger.warning("DNS resolution timed out")
        raise UrlReadError("Không thể tải URL.") from exc
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


def _is_blocked_ip(
    ip: ipaddress._BaseAddress,
    seen: Optional[set[ipaddress._BaseAddress]] = None,
) -> bool:
    seen = seen or set()
    if ip in seen:
        return False
    seen.add(ip)

    if isinstance(ip, ipaddress.IPv6Address):
        if any(ip in network for network in _NAT64_NETWORKS):
            return True
        embedded = [ip.ipv4_mapped, ip.sixtofour]
        teredo = ip.teredo
        if teredo is not None:
            embedded.extend(teredo)
        if any(
            address is not None and _is_blocked_ip(address, seen)
            for address in embedded
        ):
            return True

    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or not ip.is_global
    )


def _validate_url_or_raise(url: str) -> list[str]:
    """Validate a URL and return every public IP available for connection."""
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
        return [str(literal_ip)]

    addresses = _resolve_host(host)
    if not addresses:
        raise UrlReadError("Không thể phân giải tên miền.")
    validated: list[str] = []
    for addr in addresses:
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            # Unknown address family — refuse rather than allow by default.
            raise UrlReadError("URL không được phép (chặn truy cập nội bộ).")
        if _is_blocked_ip(ip):
            raise UrlReadError("URL không được phép (chặn truy cập nội bộ).")
        validated.append(str(ip))
    return validated


def _pinned_request_parts(url: str, connect_ip: str) -> tuple[str, str, str]:
    """Return the IP URL, original Host header, and TLS SNI hostname."""
    parts = urllib.parse.urlsplit(url)
    host = parts.hostname or ""
    ip = ipaddress.ip_address(connect_ip)
    pinned_host = f"[{ip}]" if ip.version == 6 else str(ip)
    if parts.port is not None:
        pinned_host = f"{pinned_host}:{parts.port}"

    host_header = f"[{host}]" if ":" in host else host
    if parts.port is not None:
        host_header = f"{host_header}:{parts.port}"

    pinned_url = urllib.parse.urlunsplit(
        (parts.scheme, pinned_host, parts.path or "/", parts.query, "")
    )
    return pinned_url, host_header, host


@contextlib.contextmanager
def _open_stream(url: str, connect_ip: str):
    """Connect to a validated IP while preserving Host and TLS SNI."""
    pinned_url, host_header, sni_hostname = _pinned_request_parts(url, connect_ip)
    with httpx.Client(
        timeout=_remaining_timeout_seconds(),
        follow_redirects=False,
        trust_env=False,
        verify=True,
    ) as client:
        with client.stream(
            "GET",
            pinned_url,
            headers={"User-Agent": _USER_AGENT, "Host": host_header},
            extensions={"sni_hostname": sni_hostname},
        ) as resp:
            yield resp


def _raise_if_deadline_exceeded(deadline: float) -> None:
    if time.monotonic() >= deadline:
        raise UrlReadError("Không thể tải URL.")


def _run_fetch_with_deadline(
    fetcher: Callable[[str, float], str], url: str
) -> str:
    deadline = _ACTIVE_DEADLINE.get()
    if deadline is None:
        deadline = time.monotonic() + _TOTAL_DEADLINE_SECONDS
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise UrlReadError("Không thể tải URL.")

    def run() -> str:
        token = _ACTIVE_DEADLINE.set(deadline)
        try:
            return fetcher(url, deadline)
        finally:
            _ACTIVE_DEADLINE.reset(token)

    future = _FETCH_EXECUTOR.submit(run)
    try:
        return future.result(timeout=remaining)
    except concurrent.futures.TimeoutError as exc:
        future.cancel()
        raise UrlReadError("Không thể tải URL.") from exc


def _fetch_html(url: str) -> str:
    """Fetch HTML with SSRF guard, size cap, and manual redirect validation."""
    return _run_fetch_with_deadline(_fetch_html_until_deadline, url)


def _fetch_html_until_deadline(url: str, deadline: float) -> str:
    return _fetch_text_until_deadline(
        url,
        deadline,
        max_bytes=MAX_BYTES,
        require_html=True,
        robots_policy=False,
    )


def _fetch_robots_text(url: str) -> str:
    return _run_fetch_with_deadline(_fetch_robots_until_deadline, url)


def _fetch_robots_until_deadline(url: str, deadline: float) -> str:
    return _fetch_text_until_deadline(
        url,
        deadline,
        max_bytes=_ROBOTS_MAX_BYTES,
        require_html=False,
        robots_policy=True,
    )


def _fetch_text_until_deadline(
    url: str,
    deadline: float,
    *,
    max_bytes: int,
    require_html: bool,
    robots_policy: bool,
) -> str:
    current_url = url
    for _ in range(_MAX_REDIRECTS + 1):
        _raise_if_deadline_exceeded(deadline)
        connect_ips = _validate_url_or_raise(current_url)
        redirect_url: Optional[str] = None
        last_transport_error: Optional[httpx.TransportError] = None

        for connect_ip in connect_ips:
            _raise_if_deadline_exceeded(deadline)
            try:
                with _open_stream(current_url, connect_ip) as resp:
                    _raise_if_deadline_exceeded(deadline)
                    status = resp.status_code
                    if 300 <= status < 400:
                        location = resp.headers.get("location")
                        if not location:
                            raise UrlReadError(f"HTTP {status}.")
                        redirect_url = urllib.parse.urljoin(current_url, location)
                        break
                    if robots_policy and status in {401, 403}:
                        raise UrlReadError("URL bị chặn bởi robots.txt.")
                    if robots_policy and status in {404, 410}:
                        return ""
                    if status >= 400:
                        raise UrlReadError(f"HTTP {status}.")

                    content_type = (resp.headers.get("content-type") or "").lower()
                    if require_html and (
                        "text/html" not in content_type
                        and "application/xhtml" not in content_type
                    ):
                        raise UrlReadError(
                            "Content-Type không phải HTML "
                            f"({content_type or 'unknown'})."
                        )
                    if robots_policy and content_type and "text/" not in content_type:
                        raise UrlReadError("robots.txt không phải nội dung văn bản.")

                    buf = bytearray()
                    iterator: Iterator[bytes] = resp.iter_bytes()
                    for chunk in iterator:
                        _raise_if_deadline_exceeded(deadline)
                        if not chunk:
                            continue
                        buf.extend(chunk)
                        if len(buf) > max_bytes:
                            raise UrlReadError("URL vượt quá kích thước cho phép.")
                    encoding = getattr(resp, "encoding", None) or "utf-8"
                    try:
                        return bytes(buf).decode(encoding, errors="replace")
                    except LookupError:
                        return bytes(buf).decode("utf-8", errors="replace")
            except httpx.TransportError as exc:
                last_transport_error = exc

        if redirect_url is not None:
            current_url = redirect_url
            continue
        if last_transport_error is not None:
            raise last_transport_error

    raise UrlReadError("Quá nhiều redirect.")


def _robots_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    host = parts.hostname or ""
    netloc = f"[{host}]" if ":" in host else host
    if parts.port is not None:
        netloc = f"{netloc}:{parts.port}"
    return urllib.parse.urlunsplit((parts.scheme, netloc, "/robots.txt", "", ""))


def _robots_allows(url: str) -> bool:
    robots_url = _robots_url(url)
    policy_text = _fetch_robots_text(robots_url)
    if not policy_text:
        return True
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(policy_text.splitlines())
    return parser.can_fetch("medical-edu-agent", url)


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

    deadline = time.monotonic() + _TOTAL_DEADLINE_SECONDS
    token = _ACTIVE_DEADLINE.set(deadline)
    try:
        _validate_url_or_raise(cleaned)
        if not _robots_allows(cleaned):
            raise UrlReadError("URL bị chặn bởi robots.txt.")
        html = _fetch_html(cleaned)
    except UrlReadError:
        raise
    except Exception:
        logger.warning("URL fetch failed", exc_info=True)
        raise UrlReadError("Không thể tải URL.") from None
    finally:
        _ACTIVE_DEADLINE.reset(token)

    try:
        readable = _readable_html(html)
    except Exception:
        logger.warning("HTML parse failed", exc_info=True)
        raise UrlReadError("Không thể đọc nội dung HTML.") from None

    text = _strip_html(readable)
    if not text:
        raise UrlReadError("Trang không có nội dung đọc được.")
    return text[:MAX_CHARS]
