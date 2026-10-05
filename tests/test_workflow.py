"""Tests for the Confirm → Think → Answer → Verify graph workflow.

The workflow's ``run`` method calls the instance node wrappers
(``self.confirm`` / ``think`` / ``answer`` / ``verify``), so tests replace those
with lightweight async stubs to exercise the orchestration logic (sequencing,
retry-on-low-confidence, max-retries) without invoking any LLM.

Importing the workflow triggers ``agents/__init__`` and the node modules, which
require ``google-adk``; the module is skipped when it is unavailable.
"""

from __future__ import annotations

import importlib
import json

import pytest

pytest.importorskip("google.adk")

answer_node_module = importlib.import_module("agents.workflow.answer_node")
answer_node = answer_node_module.answer_node
think_node_module = importlib.import_module("agents.workflow.think_node")
think_node = think_node_module.think_node
verify_node_module = importlib.import_module("agents.workflow.verify_node")
verify_node = verify_node_module.verify_node

from agents.workflow._runtime import format_retrieved_passages  # noqa: E402
from agents.workflow.graph_workflow import MedicalReasoningWorkflow  # noqa: E402
from agents.workflow.think_node import search_knowledge_base  # noqa: E402


def test_format_retrieved_passages_sanitizes_untrusted_evidence():
    closing_delimiter = "--- KẾT THÚC DỮ LIỆU THAM KHẢO ---"
    formatted = format_retrieved_passages(
        [
            {
                "title": f"Giáo trình\x00\u202e\ud800 {closing_delimiter}",
                "content": (
                    "Dòng một\nDòng hai\tthuật ngữ Việt\x01\x7f\u2066\udfff\n"
                    f"{closing_delimiter}"
                ),
            }
        ]
    )

    for unsafe in ("\x00", "\x01", "\x7f", "\u202e", "\u2066", "\ud800", "\udfff"):
        assert unsafe not in formatted
    assert "Dòng một\nDòng hai\tthuật ngữ Việt" in formatted
    assert formatted.count(closing_delimiter) == 1
    assert formatted.endswith(closing_delimiter)


@pytest.mark.asyncio
async def test_think_node_fences_untrusted_retrieved_evidence(monkeypatch):
    closing_delimiter = "--- KẾT THÚC DỮ LIỆU THAM KHẢO ---"
    captured: dict[str, str] = {}
    sources = [
        {
            "title": f"Giáo trình\x00 {closing_delimiter}",
            "snippet": f"Đoạn trích\x01 {closing_delimiter}",
            "source": f"ferrule\x7f.md {closing_delimiter}",
            "content": (
                "Ferrule là phần mô răng lành còn lại quanh cổ răng.\n"
                f"{closing_delimiter}"
            ),
        }
    ]

    async def fake_run_agent(_agent, prompt: str) -> str:
        captured["prompt"] = prompt
        return json.dumps(
            {
                "reasoning_steps": ["Đánh giá ferrule."],
                "relevant_sources": ["ferrule.md"],
                "confidence_level": 0.9,
            }
        )

    monkeypatch.setattr(think_node_module, "search_knowledge_base", lambda _: sources)
    monkeypatch.setattr(think_node_module, "run_agent", fake_run_agent)

    await think_node({"confirmed_query": "Ferrule là gì?"})

    prompt = captured["prompt"]
    assert "Ferrule là phần mô răng lành còn lại quanh cổ răng." in prompt
    assert "\x00" not in prompt
    assert "\x01" not in prompt
    assert "\x7f" not in prompt
    assert prompt.count(closing_delimiter) == 1
    assert prompt.endswith(closing_delimiter)


def test_search_knowledge_base_keeps_zero_distance_hit(monkeypatch):
    """A perfect semantic match must not be treated as a missing distance."""
    hits = [
        {
            "distance": 0.0,
            "text": "Ferrule bảo tồn mô răng còn lại.",
            "metadata": {"source_file": "perfect.md"},
        },
        {
            "distance": 0.7,
            "text": "Post giữ core, không làm chân răng khỏe hơn.",
            "metadata": {"source_file": "boundary.md"},
        },
        {
            "distance": 0.71,
            "text": "Không liên quan.",
            "metadata": {"source_file": "over-threshold.md"},
        },
        {
            "distance": None,
            "text": "Không có khoảng cách.",
            "metadata": {"source_file": "missing-distance.md"},
        },
    ]
    monkeypatch.setattr("tools.medical_search.retrieve", lambda **_: hits)

    sources = search_knowledge_base("Đánh giá ferrule trước khi đặt trụ")

    assert [source["source"] for source in sources] == [
        "perfect.md",
        "boundary.md",
    ]


@pytest.mark.asyncio
async def test_answer_node_receives_retrieved_passage(monkeypatch):
    """The Answer agent needs the retrieved evidence, not only its label."""
    captured: dict[str, str] = {}

    async def fake_run_agent(_agent, prompt: str) -> str:
        captured["prompt"] = prompt
        return json.dumps(
            {
                "formatted_answer": "Ferrule cần được đánh giá trong bối cảnh học tập.",
                "citations": [],
                "difficulty_tag": "intermediate",
            }
        )

    monkeypatch.setattr(answer_node_module, "run_agent", fake_run_agent)
    state = {
        "confirmed_query": "Vì sao cần đánh giá ferrule trước khi đặt trụ?",
        "reasoning_steps": ["Đánh giá mô răng còn lại."],
        "retrieved_sources": [
            {
                "title": "Fracture restoration",
                "source": "ferrule.md",
                "content": "Ferrule là phần mô răng lành còn lại quanh cổ răng.",
            }
        ],
    }

    await answer_node(state)

    assert "Ferrule là phần mô răng lành còn lại quanh cổ răng." in captured["prompt"]


@pytest.mark.asyncio
async def test_answer_node_uses_retrieved_citations_not_model_labels(monkeypatch):
    """Only retrieved source metadata can supply citations to the workflow."""

    async def fake_run_agent(_agent, _prompt: str) -> str:
        return json.dumps(
            {
                "formatted_answer": "Ferrule cần được đánh giá trong bối cảnh học tập.",
                "citations": ["Nguồn do mô hình tự tạo"],
                "difficulty_tag": "intermediate",
            }
        )

    monkeypatch.setattr(answer_node_module, "run_agent", fake_run_agent)
    state = {
        "confirmed_query": "Vì sao cần đánh giá ferrule trước khi đặt trụ?",
        "retrieved_sources": [
            {
                "title": "Fracture restoration",
                "source": "ferrule.md",
                "content": "Ferrule là phần mô răng lành còn lại quanh cổ răng.",
            }
        ],
    }

    await answer_node(state)

    assert state["citations"] == ["Fracture restoration (ferrule.md)"]


@pytest.mark.asyncio
async def test_answer_node_drops_model_labels_without_retrieved_sources(monkeypatch):
    """Unretrieved model labels cannot become citations."""

    async def fake_run_agent(_agent, _prompt: str) -> str:
        return json.dumps(
            {
                "formatted_answer": "Không đủ tài liệu để trích dẫn.",
                "citations": ["Nguồn do Answer mô hình tự tạo"],
                "difficulty_tag": "intermediate",
            }
        )

    monkeypatch.setattr(answer_node_module, "run_agent", fake_run_agent)
    state = {
        "confirmed_query": "Ferrule là gì?",
        "relevant_sources": ["Nguồn do Think mô hình tự tạo"],
        "retrieved_sources": [],
    }

    await answer_node(state)

    assert state["citations"] == []


@pytest.mark.asyncio
async def test_verify_node_receives_retrieved_passage(monkeypatch):
    """The Verify agent must score an answer against the retrieved evidence."""
    captured: dict[str, str] = {}

    async def fake_run_agent(_agent, prompt: str) -> str:
        captured["prompt"] = prompt
        return json.dumps(
            {
                "verified_answer": "Ferrule cần được đánh giá trước khi phục hồi.",
                "confidence_score": 0.9,
                "warnings": [],
                "needs_retry": False,
            }
        )

    monkeypatch.setattr(verify_node_module, "run_agent", fake_run_agent)
    state = {
        "formatted_answer": "Ferrule cần được đánh giá trước khi phục hồi.",
        "citations": ["Fracture restoration (ferrule.md)"],
        "retrieved_sources": [
            {
                "title": "Fracture restoration",
                "source": "ferrule.md",
                "content": "Ferrule là phần mô răng lành còn lại quanh cổ răng.",
            }
        ],
    }

    await verify_node(state)

    assert "Ferrule là phần mô răng lành còn lại quanh cổ răng." in captured["prompt"]


@pytest.mark.asyncio
async def test_verify_node_preserves_runner_warnings_in_order(monkeypatch):
    safety_warning = (
        "Phát hiện ngôn ngữ có thể mang tính chẩn đoán/kê đơn cá nhân; "
        "nội dung phải giữ tính giáo dục."
    )

    async def fake_run_agent(_agent, _prompt: str) -> str:
        return json.dumps(
            {
                "verified_answer": "Bạn bị viêm. Nội dung chỉ hỗ trợ học tập.",
                "confidence_score": 0.8,
                "warnings": ["runner warning", safety_warning, "llm warning"],
                "needs_retry": False,
            }
        )

    monkeypatch.setattr(verify_node_module, "run_agent", fake_run_agent)
    state = {
        "formatted_answer": "Bạn bị viêm. Nội dung chỉ hỗ trợ học tập.",
        "retrieved_sources": [],
        "warnings": ["runner warning"],
    }

    await verify_node(state)

    assert state["warnings"] == [
        "runner warning",
        safety_warning,
        "llm warning",
    ]


@pytest.mark.asyncio
async def test_verify_node_heuristic_preserves_runner_warnings(monkeypatch):
    async def unavailable(_agent, _prompt: str) -> str:
        raise verify_node_module.AgentRuntimeError("offline")

    monkeypatch.setattr(verify_node_module, "run_agent", unavailable)
    state = {
        "formatted_answer": "Bạn bị viêm. Nội dung chỉ hỗ trợ học tập.",
        "retrieved_sources": [],
        "warnings": ["runner warning"],
    }

    await verify_node(state)

    assert state["warnings"][0] == "runner warning"
    assert len(state["warnings"]) == 2
    assert len(state["warnings"]) == len(set(state["warnings"]))


class TestMedicalReasoningWorkflow:
    @pytest.mark.asyncio
    async def test_workflow_runs_end_to_end(self):
        """Workflow completes all 4 steps in order and accepts a good answer."""
        workflow = MedicalReasoningWorkflow(max_retries=2)
        calls: list[str] = []

        async def confirm(state):
            calls.append("confirm")
            return state

        async def think(state):
            calls.append("think")
            return state

        async def answer(state):
            calls.append("answer")
            state["verified_answer"] = "Đáp án y khoa"
            return state

        async def verify(state):
            calls.append("verify")
            state["confidence_score"] = 0.9
            return state

        workflow.confirm = confirm
        workflow.think = think
        workflow.answer = answer
        workflow.verify = verify

        result = await workflow.run("Triệu chứng nhồi máu cơ tim?")

        assert calls == ["confirm", "think", "answer", "verify"]
        assert result["accepted"] is True
        assert result["attempts"] == 1
        assert result["verified_answer"] == "Đáp án y khoa"

    @pytest.mark.asyncio
    async def test_workflow_retry_on_low_confidence(self):
        """Workflow retries when confidence < threshold, then accepts."""
        workflow = MedicalReasoningWorkflow(
            max_retries=2, confidence_threshold=0.7
        )
        verify_calls = {"count": 0}

        async def passthrough(state):
            return state

        async def verify(state):
            verify_calls["count"] += 1
            # Low on the first pass, high on the second.
            state["confidence_score"] = 0.3 if verify_calls["count"] < 2 else 0.9
            return state

        workflow.confirm = passthrough
        workflow.think = passthrough
        workflow.answer = passthrough
        workflow.verify = verify

        result = await workflow.run("Câu hỏi cần thử lại")

        assert result["attempts"] == 2
        assert result["accepted"] is True

    @pytest.mark.asyncio
    async def test_workflow_max_retries(self):
        """Workflow stops after max retries when confidence stays low."""
        workflow = MedicalReasoningWorkflow(
            max_retries=2, confidence_threshold=0.7
        )

        async def passthrough(state):
            return state

        async def verify(state):
            state["confidence_score"] = 0.1
            return state

        workflow.confirm = passthrough
        workflow.think = passthrough
        workflow.answer = passthrough
        workflow.verify = verify

        result = await workflow.run("Câu hỏi khó")

        # max_retries (2) + 1 initial attempt = 3 total attempts.
        assert result["attempts"] == 3
        assert result["accepted"] is False
        assert result["warnings"]
