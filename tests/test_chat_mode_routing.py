"""Routing tests for POST /api/chat with mode="chat" / "agent" / unset."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from api.deps import _react_llm_adapter, services
from main import app


@pytest.mark.asyncio
async def test_react_llm_adapter_uses_adk_runtime(monkeypatch):
    import agents.model_config
    import agents.workflow._runtime
    import google.adk

    configured_model = object()
    recorded = {}

    class FakeAgent:
        def __init__(self, *, name, model, instruction):
            recorded["agent"] = self
            recorded["name"] = name
            recorded["model"] = model
            recorded["instruction"] = instruction

    async def fake_run_agent(agent, prompt):
        recorded["run"] = (agent, prompt)
        return "adapter response"

    monkeypatch.setattr(agents.model_config, "get_primary_model", lambda: configured_model)
    monkeypatch.setattr(google.adk, "Agent", FakeAgent)
    monkeypatch.setattr(agents.workflow._runtime, "run_agent", fake_run_agent)

    adapter = _react_llm_adapter()
    result = await adapter("prompt")

    assert recorded["name"] == "chat_mode_llm"
    assert recorded["model"] is configured_model
    assert recorded["instruction"] == "Trả về đúng nội dung được yêu cầu trong prompt."
    assert recorded["run"] == (recorded["agent"], "prompt")
    assert result == "adapter response"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.db"))
    monkeypatch.setenv("MEMORY_DB_PATH", str(tmp_path / "memory.db"))
    monkeypatch.setenv("LEARNING_DB_PATH", str(tmp_path / "learning.db"))
    services._started = False
    services.startup()
    yield TestClient(app)
    services.shutdown()


class _RecordingRunner:
    def __init__(self, name: str):
        self.name = name
        self.calls: List[Dict[str, Any]] = []

    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        self.calls.append({"message": message, "context": context})
        return {
            "formatted_answer": f"{self.name} answer",
            "verified_answer": f"{self.name} answer",
            "reasoning_steps": [f"{self.name} step"],
            "citations": [],
            "retrieved_sources": [],
            "confidence_score": 0.8,
            "warnings": [],
        }


def _install_runners(monkeypatch):
    chat_runner = _RecordingRunner("chat")
    react_runner = _RecordingRunner("agent")
    monkeypatch.setattr(services, "chat_mode_runner", chat_runner, raising=False)
    monkeypatch.setattr(services, "react_runner", react_runner, raising=False)
    return chat_runner, react_runner


def test_mode_chat_invokes_chat_runner(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)
    resp = client.post(
        "/api/chat",
        json={"message": "web question", "user_id": "u1", "mode": "chat"},
    )
    assert resp.status_code == 200, resp.text
    assert len(chat_runner.calls) == 1
    assert len(react_runner.calls) == 0
    assert resp.json()["answer"] == "chat answer"


def test_mode_agent_invokes_react_runner(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)
    resp = client.post(
        "/api/chat",
        json={"message": "deep question", "user_id": "u2", "mode": "agent"},
    )
    assert resp.status_code == 200, resp.text
    assert len(react_runner.calls) == 1
    assert len(chat_runner.calls) == 0
    assert resp.json()["answer"] == "agent answer"


def test_agent_runner_failure_returns_safe_response(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)

    async def failing_run(_message, _context):
        raise RuntimeError("secret provider detail")

    monkeypatch.setattr(react_runner, "run", failing_run)
    resp = client.post(
        "/api/chat",
        json={"message": "deep question", "user_id": "u2", "mode": "agent"},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "secret provider detail" not in body["answer"]
    assert "RunnerError: RuntimeError" in body["warnings"]
    assert len(chat_runner.calls) == 0


def test_mode_unset_defaults_to_agent(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)
    resp = client.post(
        "/api/chat",
        json={"message": "no mode", "user_id": "u3"},
    )
    assert resp.status_code == 200, resp.text
    assert len(react_runner.calls) == 1
    assert len(chat_runner.calls) == 0
