"""Tests for the Tavily-backed web-search tool."""

from __future__ import annotations

import pytest

from tools.web_search import UsageLimitExceededError, WebSearchError, tavily_search


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


class _SequencedStubClient(_StubClient):
    def __init__(self, outcomes):
        super().__init__()
        self._outcomes = iter(outcomes)

    def search(self, query, **kwargs):
        self.calls.append({"query": query, **kwargs})
        outcome = next(self._outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class _HttpError(RuntimeError):
    def __init__(self, status_code):
        super().__init__(f"HTTP {status_code}")
        self.response = type("Response", (), {"status_code": status_code})()


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


def test_tavily_search_enforces_max_results_locally(monkeypatch):
    stub = _StubClient(
        response={
            "results": [
                {"title": "First"},
                {"title": "Second"},
                {"title": "Unexpected extra"},
            ]
        }
    )
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    results = tavily_search("anything", max_results=2)

    assert [result["title"] for result in results] == ["First", "Second"]


@pytest.mark.parametrize("max_results", [0, -1, True, 1.5, "2", None])
def test_tavily_search_rejects_invalid_max_results(max_results):
    with pytest.raises(ValueError, match="max_results"):
        tavily_search("anything", max_results=max_results)


def test_tavily_search_caps_max_results_at_safe_limit(monkeypatch):
    stub = _StubClient(
        response={"results": [{"title": f"Result {i}"} for i in range(15)]}
    )
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr("tools.web_search._build_client", lambda _api_key: stub)

    results = tavily_search("anything", max_results=1_000)

    assert stub.calls[0]["max_results"] == 10
    assert len(results) == 10


def test_tavily_search_missing_key_is_logged_but_sanitized(monkeypatch, caplog):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    with caplog.at_level("ERROR"), pytest.raises(WebSearchError) as exc_info:
        tavily_search("anything")

    assert "TAVILY_API_KEY" in caplog.text
    assert "TAVILY_API_KEY" not in str(exc_info.value)
    assert str(exc_info.value) == "Web search provider unavailable."


def test_tavily_search_api_failure_is_logged_but_sanitized(
    monkeypatch, caplog
):
    sentinel = "PROVIDER_SECRET_TOKEN_67"
    stub = _StubClient(exc=RuntimeError(f"upstream rejected {sentinel}"))
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    with caplog.at_level("WARNING"), pytest.raises(WebSearchError) as exc_info:
        tavily_search("anything")

    assert sentinel in caplog.text
    assert sentinel not in str(exc_info.value)
    assert str(exc_info.value) == "Web search provider unavailable."


def test_tavily_search_retries_usage_limit_once(monkeypatch):
    response = {"results": [{"title": "Recovered"}]}
    stub = _SequencedStubClient(
        [UsageLimitExceededError("rate limited"), response]
    )
    sleeps = []
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr("tools.web_search._build_client", lambda _api_key: stub)
    monkeypatch.setattr("tools.web_search.time.sleep", sleeps.append)

    results = tavily_search("retry me")

    assert [result["title"] for result in results] == ["Recovered"]
    assert len(stub.calls) == 2
    assert len(sleeps) == 1
    assert 0 < sleeps[0] <= 1


def test_tavily_search_retries_server_error_once(monkeypatch):
    response = {"results": [{"title": "Recovered"}]}
    stub = _SequencedStubClient([_HttpError(503), response])
    sleeps = []
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr("tools.web_search._build_client", lambda _api_key: stub)
    monkeypatch.setattr("tools.web_search.time.sleep", sleeps.append)

    results = tavily_search("retry me")

    assert [result["title"] for result in results] == ["Recovered"]
    assert len(stub.calls) == 2
    assert len(sleeps) == 1


def test_tavily_search_retries_http_429_once(monkeypatch):
    response = {"results": [{"title": "Recovered"}]}
    stub = _SequencedStubClient([_HttpError(429), response])
    sleeps = []
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr("tools.web_search._build_client", lambda _api_key: stub)
    monkeypatch.setattr("tools.web_search.time.sleep", sleeps.append)

    results = tavily_search("retry me")

    assert [result["title"] for result in results] == ["Recovered"]
    assert len(stub.calls) == 2
    assert len(sleeps) == 1


@pytest.mark.parametrize("status_code", [400, 401])
def test_tavily_search_does_not_retry_non_transient_http_errors(
    monkeypatch, status_code
):
    stub = _StubClient(exc=_HttpError(status_code))
    sleeps = []
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr("tools.web_search._build_client", lambda _api_key: stub)
    monkeypatch.setattr("tools.web_search.time.sleep", sleeps.append)

    with pytest.raises(WebSearchError, match="Web search provider unavailable"):
        tavily_search("do not retry")

    assert len(stub.calls) == 1
    assert sleeps == []


def test_tavily_search_caps_all_untrusted_result_fields(monkeypatch):
    stub = _StubClient(
        response={
            "results": [
                {
                    "title": "T" * 1_000,
                    "url": "https://example.com/" + ("u" * 5_000),
                    "snippet": "S" * 5_000,
                    "content": "C" * 20_000,
                }
            ]
        }
    )
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    result = tavily_search("anything")[0]

    assert len(result["title"]) <= 300
    assert len(result["url"]) <= 2_048
    assert len(result["snippet"]) <= 1_000
    assert len(result["content"]) <= 8_000


def test_tavily_search_malformed_response_is_logged_but_sanitized(
    monkeypatch, caplog
):
    stub = _StubClient(response={"unexpected": []})
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    with caplog.at_level("WARNING"), pytest.raises(WebSearchError) as exc_info:
        tavily_search("anything")

    assert "malformed" in caplog.text.lower()
    assert str(exc_info.value) == "Web search provider unavailable."


def test_tavily_search_rejects_non_dict_result_without_leaking_it(
    monkeypatch, caplog
):
    sentinel = "MALFORMED_PROVIDER_ITEM_SECRET_67"
    stub = _StubClient(response={"results": [{"title": "Valid"}, sentinel]})
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    with caplog.at_level("WARNING"), pytest.raises(WebSearchError) as exc_info:
        tavily_search("anything")

    assert "malformed" in caplog.text.lower()
    assert sentinel not in caplog.text
    assert sentinel not in str(exc_info.value)
    assert str(exc_info.value) == "Web search provider unavailable."


def test_tavily_search_empty_query_returns_empty_list(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    assert tavily_search("   ") == []
