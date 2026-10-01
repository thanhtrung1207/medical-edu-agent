"""Tests for the new ChatRequest.mode field."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.models import ChatRequest


def test_chat_request_defaults_to_agent_mode():
    req = ChatRequest(message="hello", user_id="u1")
    assert req.mode == "agent"


def test_chat_request_accepts_chat_mode():
    req = ChatRequest(message="hello", user_id="u1", mode="chat")
    assert req.mode == "chat"


def test_chat_request_accepts_agent_mode_explicit():
    req = ChatRequest(message="hello", user_id="u1", mode="agent")
    assert req.mode == "agent"


def test_chat_request_rejects_unknown_mode():
    with pytest.raises(ValidationError):
        ChatRequest(message="hello", user_id="u1", mode="deep-research")
