"""Tests for the readability-based URL reader tool."""

from __future__ import annotations

import contextlib

import httpx
import pytest

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
    def _factory(url):
        return _StreamStub(status_code=status_code, headers=headers, chunks=chunks)

    return _factory


def _allow_public(monkeypatch):
    """Make _resolve_host return a public IP so SSRF guard passes."""
    monkeypatch.setattr("tools.url_reader._resolve_host", lambda h: ["8.8.8.8"])


# ----- Existing behavior (updated to use new seams) --------------------------

def test_read_url_returns_cleaned_text(monkeypatch):
    html = "<html><body><p>Hello world — Xin chào.</p></body></html>"
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

    monkeypatch.setattr("tools.url_reader._fetch_html", raiser)

    with pytest.raises(UrlReadError):
        read_url("https://example.com")


def test_read_url_empty_url_raises():
    with pytest.raises(UrlReadError):
        read_url("   ")


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

    def raiser(u):
        raise httpx.ConnectError(f"could not connect to {u} with token SECRET123")

    monkeypatch.setattr("tools.url_reader._open_stream", raiser)

    with pytest.raises(UrlReadError) as exc_info:
        read_url(url)

    msg = str(exc_info.value)
    assert url not in msg
    assert "SECRET123" not in msg
    assert "could not connect" not in msg
    assert "Không thể tải URL" in msg
