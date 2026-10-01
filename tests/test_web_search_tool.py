"""Tests for the Tavily-backed web-search tool."""

from __future__ import annotations

import pytest

from tools.web_search import WebSearchError, tavily_search


class _StubClient:
    """Minimal stand-in for tavily.TavilyClient."""

    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.calls = []

    def search(self, query, **kwargs):
        self.calls.append({"query": query, **kwargs})
        if self._exc is not None:
            raise self._exc
        return self._response


def test_tavily_search_returns_normalized_results(monkeypatch):
    stub = _StubClient(
        response={
            "results": [
                {
                    "title": "ADA composite guideline 2025",
                    "url": "https://ada.org/x",
                    "content": "Full body text ...",
                    "snippet": "Short snippet",
                }
            ]
        }
    )
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    results = tavily_search("latest composite guideline", max_results=3)

    assert results == [
        {
            "title": "ADA composite guideline 2025",
            "url": "https://ada.org/x",
            "snippet": "Short snippet",
            "content": "Full body text ...",
        }
    ]
    assert stub.calls[0]["query"] == "latest composite guideline"
    assert stub.calls[0]["max_results"] == 3


def test_tavily_search_missing_key_raises(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    with pytest.raises(WebSearchError) as exc:
        tavily_search("anything")

    assert "TAVILY_API_KEY" in str(exc.value)


def test_tavily_search_api_failure_raises(monkeypatch):
    stub = _StubClient(exc=RuntimeError("boom"))
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    with pytest.raises(WebSearchError):
        tavily_search("anything")


def test_tavily_search_empty_query_returns_empty_list(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    assert tavily_search("   ") == []
