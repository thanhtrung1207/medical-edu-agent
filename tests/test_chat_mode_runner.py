"""Tests for ChatModeRunner — Tavily search → LLM summarize."""

from __future__ import annotations

import pytest

from agents.workflow.chat_mode import ChatModeRunner
from tools.web_search import WebSearchError


SAMPLE_RESULTS = [
    {
        "title": "ADA composite guideline 2025",
        "url": "https://ada.org/x",
        "snippet": "Composite restorations ...",
        "content": "Composite restorations ...",
    },
    {
        "title": "VN MOH thông báo nha khoa",
        "url": "https://moh.gov.vn/y",
        "snippet": "Khuyến cáo mới nhất ...",
        "content": "Khuyến cáo mới nhất ...",
    },
]


@pytest.mark.asyncio
async def test_chat_mode_happy_path(monkeypatch):
    monkeypatch.setattr(
        "agents.workflow.chat_mode.tavily_search",
        lambda query, max_results=5: SAMPLE_RESULTS,
    )

    async def fake_llm(prompt: str) -> str:
        return "Theo [1] và [2], composite ..."

    runner = ChatModeRunner(llm=fake_llm)
    state = await runner.run("ADA guideline mới nhất?", context={})

    assert state["verified_answer"].startswith("Theo [1]")
    assert state["formatted_answer"] == state["verified_answer"]
    assert len(state["retrieved_sources"]) == 2
    assert state["retrieved_sources"][0]["title"] == "ADA composite guideline 2025"
    assert state["reasoning_steps"] == ["🌐 Tìm kiếm web (Tavily, 2 kết quả)"]
    assert state["confidence_score"] == pytest.approx(0.7)
    assert state["warnings"] == []


@pytest.mark.asyncio
async def test_chat_mode_tavily_failure_graceful(monkeypatch):
    def fail(*args, **kwargs):
        raise WebSearchError("missing key")

    monkeypatch.setattr("agents.workflow.chat_mode.tavily_search", fail)

    async def fake_llm(prompt: str) -> str:
        pytest.fail("LLM should not be invoked when search fails")

    runner = ChatModeRunner(llm=fake_llm)
    state = await runner.run("gì đó", context={})

    assert "Tạm thời không thể tìm kiếm web" in state["verified_answer"]
    assert "WebSearchError" in state["warnings"][0]
    assert state["retrieved_sources"] == []
    assert state["citations"] == []
    assert state["confidence_score"] == 0.0


@pytest.mark.asyncio
async def test_chat_mode_empty_results(monkeypatch):
    monkeypatch.setattr(
        "agents.workflow.chat_mode.tavily_search",
        lambda query, max_results=5: [],
    )

    async def fake_llm(prompt: str) -> str:
        pytest.fail("LLM should not be invoked when there are no results")

    runner = ChatModeRunner(llm=fake_llm)
    state = await runner.run("truy vấn không có kết quả", context={})

    assert "Không tìm thấy" in state["verified_answer"]
    assert state["retrieved_sources"] == []
