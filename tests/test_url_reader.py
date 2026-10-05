"""Tests for the readability-based URL reader tool."""

from __future__ import annotations

import contextlib
import ipaddress
import time as wall_time

import httpx
import pytest

import tools.url_reader as url_reader_module
from tools.url_reader import UrlReadError, read_url


class _StreamStub:
    """Fake httpx streaming response (context-manager + iter_bytes)."""

    def __init__(self, status_code=200, headers=None, chunks=(b"",)):
        self.status_code = status_code
        self.headers = headers or {"content-type": "text/html; charset=utf-8"}
        self._chunks = list(chunks)
        self.encoding = "utf-8"

    def iter_bytes(self):
        for c in self._chunks:
            yield c

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def _stream_factory(status_code=200, headers=None, chunks=(b"",)):
    def _factory(url, connect_ip):
        return _StreamStub(status_code=status_code, headers=headers, chunks=chunks)

    return _factory


def _allow_robots(monkeypatch):
    monkeypatch.setattr(
        "tools.url_reader._validate_url_or_raise", lambda _url: ["8.8.8.8"]
    )
    monkeypatch.setattr(
        "tools.url_reader._robots_allows", lambda _url: True, raising=False
    )


def _allow_public(monkeypatch):
    """Make _resolve_host return a public IP so SSRF guard passes."""
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda h: ["8.8.8.8"])
    _allow_robots(monkeypatch)


# ----- Existing behavior (updated to use new seams) --------------------------

def test_read_url_returns_cleaned_text(monkeypatch):
    html = "<html><body><p>Hello world — Xin chào.</p></body></html>"
    _allow_robots(monkeypatch)
    monkeypatch.setattr("tools.url_reader._fetch_html", lambda u: html)
    monkeypatch.setattr(
        "tools.url_reader._readable_html",
        lambda h: "<p>Hello world — Xin chào.</p>",
    )

    result = read_url("https://example.com")

    assert "Hello world" in result
    assert "<p>" not in result  # tags stripped
    assert len(result) <= 8000


def test_read_url_truncates_to_8000_chars(monkeypatch):
    long_html = "<p>" + ("A" * 20000) + "</p>"
    _allow_robots(monkeypatch)
    monkeypatch.setattr("tools.url_reader._fetch_html", lambda u: long_html)
    monkeypatch.setattr("tools.url_reader._readable_html", lambda h: long_html)

    result = read_url("https://example.com")
    assert len(result) == 8000


def test_read_url_rejects_non_html(monkeypatch):
    _allow_public(monkeypatch)
    monkeypatch.setattr(
        "tools.url_reader._open_stream",
        _stream_factory(
            headers={"content-type": "application/pdf"},
            chunks=[b"binary"],
        ),
    )

    with pytest.raises(UrlReadError):
        read_url("https://example.com/file.pdf")


def test_read_url_fetch_failure(monkeypatch):
    def raiser(u):
        raise RuntimeError("timeout")

    _allow_robots(monkeypatch)
    monkeypatch.setattr("tools.url_reader._fetch_html", raiser)

    with pytest.raises(UrlReadError):
        read_url("https://example.com")


def test_read_url_empty_url_raises():
    with pytest.raises(UrlReadError):
        read_url("   ")


def test_read_url_rejects_robots_disallowed_target(monkeypatch):
    monkeypatch.setattr(
        "tools.url_reader._validate_url_or_raise", lambda _url: ["8.8.8.8"]
    )
    monkeypatch.setattr(
        "tools.url_reader._robots_allows", lambda _url: False, raising=False
    )
    monkeypatch.setattr(
        "tools.url_reader._fetch_html",
        lambda _url: pytest.fail("disallowed page must not be fetched"),
    )

    with pytest.raises(UrlReadError, match="robots.txt"):
        read_url("https://example.com/private/article")


def test_robots_policy_parser_obeys_disallow(monkeypatch):
    monkeypatch.setattr(
        "tools.url_reader._fetch_robots_text",
        lambda _url: "User-agent: *\nDisallow: /private/\n",
        raising=False,
    )

    assert not url_reader_module._robots_allows(
        "https://example.com/private/article"
    )


# ----- SSRF / scheme / host hardening ---------------------------------------

def test_read_url_rejects_non_http_scheme():
    with pytest.raises(UrlReadError):
        read_url("file:///etc/passwd")


def test_read_url_rejects_ftp_scheme():
    with pytest.raises(UrlReadError):
        read_url("ftp://example.com/")


def test_read_url_rejects_loopback_host(monkeypatch):
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda h: ["127.0.0.1"])
    with pytest.raises(UrlReadError):
        read_url("http://some-host/")


def test_read_url_rejects_metadata_host():
    # Literal hostname blocked without needing network resolution.
    with pytest.raises(UrlReadError):
        read_url("http://metadata.google.internal/")


def test_read_url_rejects_private_ip(monkeypatch):
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda h: ["10.0.0.1"])
    with pytest.raises(UrlReadError):
        read_url("http://corp.example.com/")


def test_read_url_rejects_non_global_shared_address(monkeypatch):
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda h: ["100.64.0.1"])
    monkeypatch.setattr(
        "tools.url_reader._open_stream",
        lambda *args: pytest.fail("non-global address must be blocked before connect"),
    )
    with pytest.raises(UrlReadError):
        read_url("http://carrier-internal.example/")


def test_open_stream_connects_to_validated_ip_with_original_host_and_sni(
    monkeypatch,
):
    """The HTTP stack must not resolve the attacker-controlled hostname again."""
    captured = {}

    class _Client:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def stream(self, method, url, **kwargs):
            captured.update(method=method, url=str(url), request_kwargs=kwargs)
            return _StreamStub(chunks=[b"<p>ok</p>"])

    monkeypatch.setattr(url_reader_module.httpx, "Client", _Client)

    with url_reader_module._open_stream(
        "https://example.com:8443/article?q=1", "8.8.8.8"
    ):
        pass

    assert captured["url"] == "https://8.8.8.8:8443/article?q=1"
    assert captured["request_kwargs"]["headers"]["Host"] == "example.com:8443"
    assert captured["request_kwargs"]["extensions"]["sni_hostname"] == "example.com"
    assert captured["client_kwargs"]["trust_env"] is False
    assert captured["client_kwargs"]["verify"] is True


def test_fetch_html_limits_http_timeout_to_remaining_deadline(monkeypatch):
    clock = {"now": 0.0}
    captured = {}

    class _Client:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def stream(self, method, url, **kwargs):
            return _StreamStub(chunks=[b"<p>ok</p>"])

    def resolve(_host):
        clock["now"] = 8.0
        return ["8.8.8.8"]

    monkeypatch.setattr(
        url_reader_module,
        "time",
        type("Clock", (), {"monotonic": staticmethod(lambda: clock["now"])})(),
        raising=False,
    )
    monkeypatch.setattr("tools.url_reader._resolve_host", resolve)
    monkeypatch.setattr(url_reader_module.httpx, "Client", _Client)

    assert url_reader_module._fetch_html("https://example.com/article") == "<p>ok</p>"
    assert captured["timeout"] == pytest.approx(2.0)


def test_fetch_html_bounds_slow_dns_resolution(monkeypatch):
    def slow_getaddrinfo(_host, _port):
        wall_time.sleep(0.3)
        return [(2, 1, 6, "", ("8.8.8.8", 0))]

    monkeypatch.setattr(url_reader_module, "_TOTAL_DEADLINE_SECONDS", 0.02)
    monkeypatch.setattr(url_reader_module.socket, "getaddrinfo", slow_getaddrinfo)

    started = wall_time.monotonic()
    with pytest.raises(UrlReadError, match="^Không thể tải URL\\.$"):
        url_reader_module._fetch_html("https://example.com/article")
    elapsed = wall_time.monotonic() - started

    assert elapsed < 0.15


def test_fetch_html_bounds_a_blocking_stream_operation(monkeypatch):
    @contextlib.contextmanager
    def slow_stream(_url, _connect_ip):
        wall_time.sleep(0.3)
        yield _StreamStub(chunks=[b"<p>late</p>"])

    monkeypatch.setattr(url_reader_module, "_TOTAL_DEADLINE_SECONDS", 0.02)
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda _host: ["8.8.8.8"])
    monkeypatch.setattr("tools.url_reader._open_stream", slow_stream)

    started = wall_time.monotonic()
    with pytest.raises(UrlReadError, match="^Không thể tải URL\\.$"):
        url_reader_module._fetch_html("https://example.com/article")
    elapsed = wall_time.monotonic() - started

    assert elapsed < 0.15


def test_redirect_hops_are_independently_resolved_and_pinned(monkeypatch):
    resolutions = []
    opened = []

    def resolve(host):
        resolutions.append(host)
        return {
            "first.example": ["8.8.8.8"],
            "second.example": ["1.1.1.1"],
        }[host]

    responses = iter(
        [
            _StreamStub(status_code=302, headers={"location": "https://second.example/final"}),
            _StreamStub(chunks=[b"<p>done</p>"]),
        ]
    )

    @contextlib.contextmanager
    def open_stream(url, connect_ip):
        opened.append((url, connect_ip))
        yield next(responses)

    monkeypatch.setattr("tools.url_reader._resolve_host", resolve)
    monkeypatch.setattr("tools.url_reader._open_stream", open_stream)

    assert url_reader_module._fetch_html("https://first.example/start") == "<p>done</p>"
    assert resolutions == ["first.example", "second.example"]
    assert opened == [
        ("https://first.example/start", "8.8.8.8"),
        ("https://second.example/final", "1.1.1.1"),
    ]


def test_fetch_html_fails_over_across_pinned_addresses_without_reresolving(
    monkeypatch,
):
    resolutions = []
    opened = []

    def resolve(host):
        resolutions.append(host)
        return ["8.8.8.8", "1.1.1.1"]

    @contextlib.contextmanager
    def open_stream(url, connect_ip):
        opened.append((url, connect_ip))
        if connect_ip == "8.8.8.8":
            raise httpx.ConnectError("first address unavailable")
        yield _StreamStub(chunks=[b"<p>failover works</p>"])

    monkeypatch.setattr("tools.url_reader._resolve_host", resolve)
    monkeypatch.setattr("tools.url_reader._open_stream", open_stream)

    assert url_reader_module._fetch_html("https://dual.example/article") == (
        "<p>failover works</p>"
    )
    assert resolutions == ["dual.example"]
    assert opened == [
        ("https://dual.example/article", "8.8.8.8"),
        ("https://dual.example/article", "1.1.1.1"),
    ]


def test_fetch_html_enforces_total_deadline_while_streaming(monkeypatch):
    clock = {"now": 0.0}

    class DeadlineStream(_StreamStub):
        def iter_bytes(self):
            yield b"<p>first"
            clock["now"] = 100.0
            yield b" second</p>"

    monkeypatch.setattr(
        url_reader_module,
        "time",
        type("Clock", (), {"monotonic": staticmethod(lambda: clock["now"])})(),
        raising=False,
    )
    _allow_public(monkeypatch)
    monkeypatch.setattr(
        "tools.url_reader._open_stream",
        lambda _url, _connect_ip: DeadlineStream(),
    )

    with pytest.raises(UrlReadError, match="^Không thể tải URL\\.$"):
        url_reader_module._fetch_html("https://example.com/article")


def test_fetch_html_stops_failover_when_total_deadline_expires(monkeypatch):
    clock = {"now": 0.0}
    opened = []

    monkeypatch.setattr(
        url_reader_module,
        "time",
        type("Clock", (), {"monotonic": staticmethod(lambda: clock["now"])})(),
        raising=False,
    )
    monkeypatch.setattr(
        "tools.url_reader._resolve_host", lambda _host: ["8.8.8.8", "1.1.1.1"]
    )

    @contextlib.contextmanager
    def open_stream(url, connect_ip):
        opened.append((url, connect_ip))
        clock["now"] = 100.0
        raise httpx.ConnectError("first address unavailable")
        yield  # pragma: no cover

    monkeypatch.setattr("tools.url_reader._open_stream", open_stream)

    with pytest.raises(UrlReadError, match="^Không thể tải URL\\.$"):
        url_reader_module._fetch_html("https://dual.example/article")

    assert opened == [("https://dual.example/article", "8.8.8.8")]


@pytest.mark.parametrize(
    "address",
    [
        "2002:7f00:1::",  # 6to4 embeds IPv4 loopback 127.0.0.1
        "64:ff9b::7f00:1",  # NAT64 embeds IPv4 loopback 127.0.0.1
    ],
)
def test_read_url_rejects_ipv6_addresses_that_embed_loopback(monkeypatch, address):
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda _host: [address])
    monkeypatch.setattr(
        "tools.url_reader._open_stream",
        lambda *args: pytest.fail("embedded loopback must be blocked before connect"),
    )

    with pytest.raises(UrlReadError):
        read_url("https://transition.example/")


class _GloballyClassifiedIPv6(ipaddress.IPv6Address):
    """Expose embedded-address checks independently of stdlib classifications."""

    is_private = False
    is_loopback = False
    is_link_local = False
    is_reserved = False
    is_multicast = False
    is_unspecified = False
    is_global = True


@pytest.mark.parametrize(
    "address",
    [
        "::ffff:127.0.0.1",  # IPv4-mapped loopback
        "2002:0a00:0001::",  # 6to4 embeds private 10.0.0.1
        "2001:0000:0a00:0001:8000:63bf:f7f7:f7f7",  # private Teredo server
        "2001:0000:4136:e378:8000:63bf:80ff:fffe",  # loopback Teredo client
    ],
)
def test_is_blocked_ip_recursively_checks_ipv6_embedded_addresses(address):
    assert url_reader_module._is_blocked_ip(_GloballyClassifiedIPv6(address))


# ----- Size cap -------------------------------------------------------------

def test_read_url_rejects_oversize_response(monkeypatch):
    _allow_public(monkeypatch)
    big_chunk = b"A" * 3_000_000  # > 2 MB cap

    def _never(_h):
        pytest.fail("_readable_html must not run when the response is oversize")

    monkeypatch.setattr(
        "tools.url_reader._open_stream",
        _stream_factory(chunks=[big_chunk]),
    )
    monkeypatch.setattr("tools.url_reader._readable_html", _never)

    with pytest.raises(UrlReadError):
        read_url("https://example.com/big")


# ----- Error-message sanitization -------------------------------------------

def test_read_url_sanitizes_error_message(monkeypatch):
    url = "https://example.com/secret?token=SECRET123"
    _allow_public(monkeypatch)

    def raiser(u, connect_ip):
        raise httpx.ConnectError(f"could not connect to {u} with token SECRET123")

    monkeypatch.setattr("tools.url_reader._open_stream", raiser)

    with pytest.raises(UrlReadError) as exc_info:
        read_url(url)

    msg = str(exc_info.value)
    assert url not in msg
    assert "SECRET123" not in msg
    assert "could not connect" not in msg
    assert "Không thể tải URL" in msg
