"""Tests for the readability-based URL reader tool."""

from __future__ import annotations

import pytest

from tools.url_reader import UrlReadError, read_url


class _StubResponse:
    def __init__(self, status_code=200, content_type="text/html; charset=utf-8", text=""):
        self.status_code = status_code
        self.headers = {"content-type": content_type}
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def _fake_summary(html):
    return "<p>Readable text extracted.</p>"


def test_read_url_returns_cleaned_text(monkeypatch):
    html = "<html><body><p>Hello world — Xin chào.</p></body></html>"

    def fake_get(url, **kwargs):
        return _StubResponse(text=html)

    monkeypatch.setattr("tools.url_reader._http_get", fake_get)
    monkeypatch.setattr("tools.url_reader._readable_html", lambda h: "<p>Hello world — Xin chào.</p>")

    result = read_url("https://example.com")

    assert "Hello world" in result
    assert "<p>" not in result  # tags stripped
    assert len(result) <= 8000


def test_read_url_truncates_to_8000_chars(monkeypatch):
    long_html = "<p>" + ("A" * 20000) + "</p>"
    monkeypatch.setattr(
        "tools.url_reader._http_get", lambda u, **k: _StubResponse(text=long_html)
    )
    monkeypatch.setattr(
        "tools.url_reader._readable_html", lambda h: long_html
    )

    result = read_url("https://example.com")
    assert len(result) == 8000


def test_read_url_rejects_non_html(monkeypatch):
    monkeypatch.setattr(
        "tools.url_reader._http_get",
        lambda u, **k: _StubResponse(content_type="application/pdf", text="binary"),
    )

    with pytest.raises(UrlReadError):
        read_url("https://example.com/file.pdf")


def test_read_url_fetch_failure(monkeypatch):
    def raiser(*args, **kwargs):
        raise RuntimeError("timeout")

    monkeypatch.setattr("tools.url_reader._http_get", raiser)

    with pytest.raises(UrlReadError):
        read_url("https://example.com")


def test_read_url_empty_url_raises():
    with pytest.raises(UrlReadError):
        read_url("   ")
