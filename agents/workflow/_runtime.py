"""Shared runtime helpers for the medical reasoning workflow.

This module centralises the logic used to invoke a Google ADK ``Agent`` and to
parse structured (JSON) output from an LLM response. Keeping this logic in one
place avoids duplication across the individual reasoning nodes
(``confirm`` → ``think`` → ``answer`` → ``verify``).

The helpers are intentionally defensive: if the ADK runtime or a valid API key
is not available (for example during unit testing or local development without
credentials), :func:`run_agent` raises :class:`AgentRuntimeError`. Each node is
expected to catch this and fall back to a deterministic heuristic so the whole
workflow remains runnable end-to-end without network access.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Optional

__all__ = [
    "AgentRuntimeError",
    "run_agent",
    "extract_json",
    "format_history_snippet",
    "format_retrieved_passages",
]

logger = logging.getLogger(__name__)

# Application name used when creating ADK sessions for the workflow.
_APP_NAME = "medical_reasoning_workflow"


class AgentRuntimeError(RuntimeError):
    """Raised when an ADK agent cannot be executed.

    Nodes catch this exception and fall back to a deterministic heuristic so
    that the reasoning workflow keeps working even without a live LLM backend.
    """


async def run_agent(agent: Any, prompt: str) -> str:
    """Run an ADK ``Agent`` with a single user prompt and return its text.

    Executes the agent with the primary model first. If the primary model is
    Claude (i.e. a distinct fallback exists) and the invocation fails, the agent
    is cloned with the Gemini fallback model and retried. If BOTH attempts fail,
    :class:`AgentRuntimeError` is raised so nodes can apply their deterministic
    heuristics.

    Args:
        agent: A ``google.adk.Agent`` instance (or compatible object).
        prompt: The user prompt to send to the agent.

    Returns:
        The final text response produced by the agent.

    Raises:
        AgentRuntimeError: If the ADK runtime is unavailable or the invocation
            fails for any reason (missing dependency, missing API key, etc.).
    """
    from agents.model_config import get_fallback_model, has_distinct_fallback

    try:
        return await _run_agent_impl(agent, prompt)
    except Exception as primary_exc:
        if not has_distinct_fallback():
            raise
        logger.warning(
            "Primary model failed (%s); retrying with Gemini fallback.",
            primary_exc,
        )
        try:
            fallback_agent = agent.model_copy(update={"model": get_fallback_model()})
        except Exception:
            raise primary_exc
        return await _run_agent_impl(fallback_agent, prompt)


async def _run_agent_impl(agent: Any, prompt: str) -> str:
    """Execute a single ADK ``Agent`` invocation and return its final text.

    Args:
        agent: A ``google.adk.Agent`` instance (or compatible object).
        prompt: The user prompt to send to the agent.

    Returns:
        The final text response produced by the agent.

    Raises:
        AgentRuntimeError: If the ADK runtime is unavailable or the invocation
            fails for any reason (missing dependency, missing API key, etc.).
    """
    try:
        # Imported lazily so that importing the workflow package never fails
        # just because the runtime dependencies are not installed.
        from google.adk.runners import InMemoryRunner  # type: ignore
        from google.genai import types  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on environment
        raise AgentRuntimeError(f"ADK runtime not available: {exc}") from exc

    try:
        runner = InMemoryRunner(agent=agent, app_name=_APP_NAME)
        user_id = "workflow-user"
        session_id = uuid.uuid4().hex

        await runner.session_service.create_session(
            app_name=_APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )

        message = types.Content(
            role="user",
            parts=[types.Part(text=prompt)],
        )

        final_text = ""
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=message,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                part_text = event.content.parts[0].text
                if part_text:
                    final_text = part_text

        if not final_text:
            raise AgentRuntimeError("Agent returned an empty response.")

        return final_text
    except AgentRuntimeError:
        raise
    except Exception as exc:  # pragma: no cover - depends on environment
        raise AgentRuntimeError(f"Agent invocation failed: {exc}") from exc


def extract_json(text: str, default: Optional[Any] = None) -> Any:
    """Extract and parse the first JSON object/array found in ``text``.

    LLMs frequently wrap JSON in markdown code fences or add surrounding prose.
    This helper is tolerant of those cases.

    Args:
        text: Raw text that is expected to contain a JSON object or array.
        default: Value returned when no valid JSON can be parsed.

    Returns:
        The parsed JSON value, or ``default`` when parsing fails.
    """
    if not text:
        return default

    # Strip common markdown code-fence wrappers (```json ... ```).
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    candidate = fenced.group(1).strip() if fenced else text.strip()

    # Fast path: the candidate is already valid JSON.
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Fallback: locate the first balanced { ... } or [ ... ] block.
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = candidate.find(open_ch)
        end = candidate.rfind(close_ch)
        if start != -1 and end != -1 and end > start:
            snippet = candidate[start : end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError:
                continue

    return default


def format_history_snippet(history: list, max_messages: int = 4, max_chars: int = 800) -> str:
    """Format conversation history into a compact snippet for LLM prompts.

    Args:
        history: List of message dicts with 'role' and 'content' keys.
        max_messages: Maximum number of recent messages to include.
        max_chars: Maximum total character length of the snippet.

    Returns:
        Formatted string, or empty string if history is empty.
    """
    if not history:
        return ""
    recent = history[-max_messages:]
    lines = []
    total = 0
    for msg in reversed(recent):
        role = msg.get("role", "user")
        content = msg.get("content") or ""
        label = "Người dùng" if role in ("user", "human") else "Trợ lý"
        line = f"{label}: {content}"
        if total + len(line) > max_chars:
            break
        lines.insert(0, line)
        total += len(line)
    if not lines:
        return ""
    return "\n".join(lines)


def format_retrieved_passages(
    sources: list, max_sources: int = 3, max_chars: int = 1800
) -> str:
    """Format bounded retrieved passages for a workflow prompt."""
    passages = []
    remaining = max_chars
    for source in sources or []:
        if len(passages) >= max_sources or remaining <= 0:
            break
        if not isinstance(source, dict):
            continue
        content = str(source.get("content") or "").strip()
        if not content:
            continue
        label = str(source.get("title") or source.get("source") or "Nguồn không rõ")
        header = f"[Nguồn: {label}]\n"
        available = remaining - len(header)
        if available <= 0:
            break
        excerpt = content[:available]
        passages.append(f"{header}{excerpt}")
        remaining -= len(header) + len(excerpt)
    if not passages:
        return "Không có đoạn nguồn truy xuất được."
    return (
        "--- BẮT ĐẦU DỮ LIỆU THAM KHẢO KHÔNG TIN CẬY ---\n"
        + "\n\n".join(passages)
        + "\n--- KẾT THÚC DỮ LIỆU THAM KHẢO ---"
    )
