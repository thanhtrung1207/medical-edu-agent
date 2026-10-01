"""ReAct-style agent runner used when ``ChatRequest.mode == "agent"``.

Loops Reason → Act → Observe up to ``max_iterations`` times. Each iteration the
LLM returns a JSON step. The runner executes the requested tool, appends the
observation to the trajectory, and loops. On ``final_answer`` (or on reaching
the iteration cap) the runner synthesizes the answer and runs the existing
Verify stage so grounding and safety checks still apply.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

__all__ = ["ReActRunner"]

LLMCallable = Callable[[str], Awaitable[str]]
RagToolCallable = Callable[[str], List[Dict[str, Any]]]
WebToolCallable = Callable[[str], List[Dict[str, Any]]]
UrlToolCallable = Callable[[str], str]
VerifyCallable = Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]


_SYSTEM_PROMPT_TEMPLATE = """Bạn là một AI agent cho sinh viên nha khoa, chạy theo vòng lặp ReAct.

Mỗi bước bạn PHẢI trả về JSON hợp lệ theo một trong hai dạng sau:
1. Gọi tool: {{"thought": "...", "action": "<tool_name>", "action_input": "<string>"}}
2. Kết thúc: {{"thought": "...", "final_answer": "<câu trả lời tiếng Việt, có trích dẫn [RAG1], [WEB1]..."}}

TOOL CÓ SẴN:
{tools}

QUY TẮC:
- Dùng rag_search cho kiến thức giáo khoa (textbook, guideline nội bộ).
- Nếu web_search có sẵn, dùng cho thông tin cập nhật (recall, guideline mới).
- Dùng read_url khi một URL đáng tin cậy cần đọc kỹ hơn snippet.
- Không bịa nguồn. Trích dẫn [RAG<n>] cho RAG, [WEB<n>] cho web.
- Tối đa {max_iterations} bước. Khi đủ dữ liệu, trả final_answer.
"""

_TOOL_DESC_RAG = "- rag_search(query): tìm tài liệu trong corpus nội bộ."
_TOOL_DESC_WEB = "- web_search(query): tìm trên web (Tavily)."
_TOOL_DESC_URL = "- read_url(url): đọc nội dung một trang web (tối đa 8000 ký tự)."


class ReActRunner:
    """ReAct loop around rag_search / web_search / read_url tools."""

    def __init__(
        self,
        llm: LLMCallable,
        rag_search: RagToolCallable,
        web_search: Optional[WebToolCallable],
        read_url: Optional[UrlToolCallable],
        verify: VerifyCallable,
        max_iterations: Optional[int] = None,
    ) -> None:
        self._llm = llm
        self._rag_search = rag_search
        self._web_search = web_search
        self._read_url = read_url
        self._verify = verify
        self._max_iterations = _resolve_max_iterations(max_iterations)

    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the ReAct loop and return a workflow-state dict."""
        trajectory: List[Dict[str, Any]] = []
        reasoning_steps: List[str] = []
        retrieved_sources: List[Dict[str, Any]] = []
        warnings: List[str] = []
        final_answer: Optional[str] = None

        system_prompt = self._build_system_prompt()

        for step_idx in range(1, self._max_iterations + 1):
            prompt = _build_step_prompt(system_prompt, message, trajectory, context)
            step = await self._ask_for_step(prompt)

            if step is None:
                # Malformed twice in a row — skip this iteration.
                warnings.append(f"Bỏ qua bước {step_idx}: JSON không hợp lệ")
                reasoning_steps.append(f"🧭 Bước {step_idx} — <bỏ qua>")
                continue

            if "final_answer" in step and step["final_answer"]:
                final_answer = str(step["final_answer"])
                reasoning_steps.append(f"🧭 Bước {step_idx} — final_answer")
                trajectory.append(step)
                break

            action = str(step.get("action") or "").strip()
            action_input = str(step.get("action_input") or "").strip()
            observation, sources = self._run_tool(action, action_input)
            step["observation"] = observation
            trajectory.append(step)
            retrieved_sources.extend(sources)
            reasoning_steps.append(
                f"🧭 Bước {step_idx} — {action}({_shorten(action_input)})"
            )

        if final_answer is None:
            warnings.append("Đã đạt max iterations — ép tổng hợp câu trả lời.")
            final_answer = await self._force_synthesis(message, trajectory)

        state: Dict[str, Any] = {
            "user_input": message,
            "context": context,
            "formatted_answer": final_answer,
            "verified_answer": final_answer,
            "reasoning_steps": reasoning_steps,
            "retrieved_sources": retrieved_sources,
            "citations": [s.get("source") or s.get("title") or "" for s in retrieved_sources],
            "warnings": warnings,
            "confidence_score": 0.0,
        }
        return await self._verify(state)

    # ---- internals ----------------------------------------------------- #

    def _build_system_prompt(self) -> str:
        tools: List[str] = [_TOOL_DESC_RAG]
        if self._web_search is not None:
            tools.append(_TOOL_DESC_WEB)
        if self._read_url is not None:
            tools.append(_TOOL_DESC_URL)
        return _SYSTEM_PROMPT_TEMPLATE.format(
            tools="\n".join(tools),
            max_iterations=self._max_iterations,
        )

    async def _ask_for_step(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Call the LLM, parse JSON, retry once on malformed output."""
        raw = await self._llm(prompt)
        parsed = _parse_step(raw)
        if parsed is not None:
            return parsed
        retry_prompt = prompt + (
            "\n\nLƯU Ý: Phản hồi trước không phải JSON hợp lệ. "
            "Hãy trả về JSON đúng schema đã mô tả."
        )
        raw_retry = await self._llm(retry_prompt)
        return _parse_step(raw_retry)

    def _run_tool(self, action: str, action_input: str):
        if action == "rag_search":
            try:
                hits = self._rag_search(action_input) or []
            except Exception as exc:
                return f"RAG error: {exc}", []
            text = _format_rag_observation(hits)
            return text, [_normalize_rag_hit(h) for h in hits]
        if action == "web_search":
            if self._web_search is None:
                return "web_search không khả dụng.", []
            try:
                hits = self._web_search(action_input) or []
            except Exception as exc:
                return f"WebSearchError: {exc}", []
            text = _format_web_observation(hits)
            return text, [_normalize_web_hit(h) for h in hits]
        if action == "read_url":
            if self._read_url is None:
                return "read_url không khả dụng.", []
            try:
                return self._read_url(action_input), []
            except Exception as exc:
                return f"UrlReadError: {exc}", []
        return f"Unknown action: {action!r}", []

    async def _force_synthesis(
        self, message: str, trajectory: List[Dict[str, Any]]
    ) -> str:
        prompt = (
            "Dựa trên trajectory bên dưới, hãy soạn câu trả lời cuối cùng "
            "bằng tiếng Việt, trích dẫn [RAG<n>] / [WEB<n>] nếu phù hợp.\n\n"
            f"CÂU HỎI: {message}\n\n"
            f"TRAJECTORY:\n{json.dumps(trajectory, ensure_ascii=False, indent=2)}"
        )
        return await self._llm(prompt)


# ---- helpers ----------------------------------------------------------- #


def _resolve_max_iterations(explicit: Optional[int]) -> int:
    if explicit is not None:
        return max(1, min(10, explicit))
    try:
        env_val = int(os.getenv("AGENT_MAX_ITERATIONS", "5"))
    except ValueError:
        env_val = 5
    return max(1, min(10, env_val))


def _parse_step(raw: str) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    # Trim leading/trailing code fences if present.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def _build_step_prompt(
    system_prompt: str,
    message: str,
    trajectory: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> str:
    history = (
        context.get("recent_history") if isinstance(context, dict) else None
    )
    history_block = f"\n\nNGỮ CẢNH:\n{history}\n" if history else ""
    traj_block = (
        json.dumps(trajectory, ensure_ascii=False, indent=2)
        if trajectory
        else "(chưa có bước nào)"
    )
    return (
        f"{system_prompt}{history_block}\n\nCÂU HỎI: {message}\n\n"
        f"TRAJECTORY HIỆN TẠI:\n{traj_block}\n\n"
        "Trả về đúng một JSON step tiếp theo."
    )


def _format_rag_observation(hits: List[Dict[str, Any]]) -> str:
    if not hits:
        return "RAG không có kết quả."
    parts: List[str] = []
    for i, hit in enumerate(hits, start=1):
        title = hit.get("title") or hit.get("source") or f"RAG{i}"
        snippet = hit.get("snippet") or hit.get("content") or ""
        parts.append(f"[RAG{i}] {title}\n{snippet}")
    return "\n\n".join(parts)


def _format_web_observation(hits: List[Dict[str, Any]]) -> str:
    if not hits:
        return "Web search không có kết quả."
    parts: List[str] = []
    for i, hit in enumerate(hits, start=1):
        title = hit.get("title") or hit.get("url") or f"WEB{i}"
        url = hit.get("url") or ""
        snippet = hit.get("snippet") or hit.get("content") or ""
        parts.append(f"[WEB{i}] {title}\nURL: {url}\n{snippet}")
    return "\n\n".join(parts)


def _normalize_rag_hit(hit: Dict[str, Any]) -> Dict[str, Any]:
    title = hit.get("title") or hit.get("source") or "RAG source"
    return {
        "title": title,
        "source": hit.get("source") or title,
        "snippet": hit.get("snippet") or hit.get("content") or "",
        "content": hit.get("content") or hit.get("snippet") or "",
    }


def _normalize_web_hit(hit: Dict[str, Any]) -> Dict[str, Any]:
    title = hit.get("title") or hit.get("url") or "Web source"
    return {
        "title": title,
        "source": hit.get("url") or title,
        "snippet": hit.get("snippet") or hit.get("content") or "",
        "content": hit.get("content") or hit.get("snippet") or "",
    }


def _shorten(text: str, limit: int = 40) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"
