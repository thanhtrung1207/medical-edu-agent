"""Tests for the Confirm → Think → Answer → Verify graph workflow.

The workflow's ``run`` method calls the instance node wrappers
(``self.confirm`` / ``think`` / ``answer`` / ``verify``), so tests replace those
with lightweight async stubs to exercise the orchestration logic (sequencing,
retry-on-low-confidence, max-retries) without invoking any LLM.

Importing the workflow triggers ``agents/__init__`` and the node modules, which
require ``google-adk``; the module is skipped when it is unavailable.
"""

from __future__ import annotations

import pytest

pytest.importorskip("google.adk")

from agents.workflow.graph_workflow import MedicalReasoningWorkflow  # noqa: E402


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
