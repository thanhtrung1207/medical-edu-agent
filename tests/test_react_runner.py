"""Tests for ReActRunner — looping tool-use agent."""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from agents.workflow.react_runner import ReActRunner
from tools.web_search import WebSearchError


def _llm_from_steps(steps: List[str]):
    """Return a fake async LLM that yields the given step strings in order."""
    idx = {"i": 0}

    async def _llm(prompt: str) -> str:
        i = idx["i"]
        idx["i"] = i + 1
        return steps[i]

    return _llm


@pytest.mark.asyncio
async def test_react_final_on_iteration_1():
    llm = _llm_from_steps([
        json.dumps({"thought": "I know this", "final_answer": "Đáp án ngắn."})
    ])
    runner = ReActRunner(
        llm=llm,
        rag_search=lambda q: pytest.fail("rag should not be called"),
        web_search=lambda q: pytest.fail("web should not be called"),
        read_url=lambda u: pytest.fail("read_url should not be called"),
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("1+1?", context={})

    assert state["verified_answer"] == "Đáp án ngắn."
    assert state["reasoning_steps"] == ["🧭 Bước 1 — final_answer"]
    assert state["warnings"] == []


@pytest.mark.asyncio
async def test_react_rag_then_web_then_final():
    steps = [
        json.dumps({"thought": "look up RAG", "action": "rag_search", "action_input": "implant"}),
        json.dumps({"thought": "need fresh info", "action": "web_search", "action_input": "ADA implant 2025"}),
        json.dumps({"thought": "done", "final_answer": "Theo [RAG1] và [WEB1]..."}),
    ]
    runner = ReActRunner(
        llm=_llm_from_steps(steps),
        rag_search=lambda q: [{"title": "Implant book", "snippet": "chap 1", "content": "chap 1", "source": "Implant book"}],
        web_search=lambda q: [{"title": "ADA 2025", "url": "https://ada.org/i", "snippet": "s", "content": "s"}],
        read_url=lambda u: pytest.fail("read_url should not be called"),
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("implant 2025?", context={})

    assert state["verified_answer"].startswith("Theo [RAG1]")
    assert len(state["reasoning_steps"]) == 3
    titles = {c.get("title") for c in state["retrieved_sources"]}
    assert titles == {"Implant book", "ADA 2025"}


@pytest.mark.asyncio
async def test_react_max_iterations_forces_synthesis():
    tool_step = json.dumps({"thought": "search again", "action": "rag_search", "action_input": "x"})
    # 5 tool calls, then one forced synthesis call that returns the final answer.
    steps = [tool_step] * 5 + ["Final synthesized answer."]
    runner = ReActRunner(
        llm=_llm_from_steps(steps),
        rag_search=lambda q: [{"title": "src", "snippet": "s", "content": "s", "source": "src"}],
        web_search=lambda q: [],
        read_url=lambda u: "",
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("deep question", context={})

    assert state["verified_answer"] == "Final synthesized answer."
    assert "max iterations" in " ".join(state["warnings"]).lower()
    assert len(state["reasoning_steps"]) == 5


@pytest.mark.asyncio
async def test_react_malformed_json_retries_once():
    steps = [
        "not json at all",  # malformed
        json.dumps({"thought": "ok now", "final_answer": "Done."}),  # retry
    ]
    runner = ReActRunner(
        llm=_llm_from_steps(steps),
        rag_search=lambda q: [],
        web_search=lambda q: [],
        read_url=lambda u: "",
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("x", context={})

    assert state["verified_answer"] == "Done."


@pytest.mark.asyncio
async def test_react_web_search_error_becomes_observation():
    seen_observations: List[str] = []

    def recording_llm(obs_list):
        steps = [
            json.dumps({"thought": "try web", "action": "web_search", "action_input": "x"}),
            json.dumps({"thought": "fallback", "final_answer": "ok"}),
        ]
        idx = {"i": 0}

        async def _llm(prompt: str) -> str:
            # Capture the prompt-visible observation on the second call.
            if idx["i"] == 1:
                obs_list.append(prompt)
            i = idx["i"]
            idx["i"] = i + 1
            return steps[i]

        return _llm

    def failing_web(q):
        raise WebSearchError("key missing")

    runner = ReActRunner(
        llm=recording_llm(seen_observations),
        rag_search=lambda q: [],
        web_search=failing_web,
        read_url=lambda u: "",
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("fresh info?", context={})

    assert state["verified_answer"] == "ok"
    assert any("WebSearchError" in prompt or "key missing" in prompt for prompt in seen_observations)


async def _identity_verify(state: Dict[str, Any]) -> Dict[str, Any]:
    """Passthrough verify stub used by tests."""
    state.setdefault("verified_answer", state.get("formatted_answer", ""))
    state.setdefault("confidence_score", 0.8)
    state.setdefault("warnings", [])
    return state
