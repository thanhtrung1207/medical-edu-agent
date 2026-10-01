"""Chat-mode runner: one Tavily search + one LLM summarize call.

Used when the frontend sends ``ChatRequest.mode == "chat"``. Bypasses RAG and
``MedicalReasoningWorkflow`` entirely. Guardrails pre/post-checks are applied
by the caller in ``api/chat.py``.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from tools.web_search import WebSearchError, tavily_search

logger = logging.getLogger(__name__)

__all__ = ["ChatModeRunner", "LLMCallable"]

LLMCallable = Callable[[str], Awaitable[str]]


_SYSTEM_PROMPT = """Bạn là trợ lý tổng hợp thông tin từ các kết quả web search cho sinh viên nha khoa.

NGUYÊN TẮC:
- Trả lời bằng tiếng Việt, rõ ràng, có cấu trúc.
- Dùng số trong ngoặc vuông để trích dẫn nguồn, ví dụ [1], [2].
- Không bịa thông tin không có trong kết quả search.
- Nếu kết quả không đủ để trả lời, hãy nói thẳng là chưa đủ dữ liệu.
- Luôn kết thúc bằng dòng "Nguồn:" liệt kê URL theo thứ tự [1], [2], ...
"""


def _default_llm() -> LLMCallable:
    """Return the project's default async LLM caller."""
    from agents.model_config import get_primary_model

    model = get_primary_model()

    async def _call(prompt: str) -> str:
        try:
            response = await model.generate_async(prompt)
        except AttributeError:
            response = model.generate(prompt)
        return str(response)

    return _call


class ChatModeRunner:
    """Runs a single Tavily search → LLM summary with inline citations."""

    def __init__(
        self,
        llm: Optional[LLMCallable] = None,
        max_results: int = 5,
    ) -> None:
        self._llm = llm or _default_llm()
        self._max_results = max_results

    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Return a state dict compatible with ``MedicalReasoningWorkflow.run``.

        Keys populated: ``formatted_answer``, ``verified_answer``,
        ``reasoning_steps``, ``citations``, ``retrieved_sources``,
        ``confidence_score``, ``warnings``.
        """
        try:
            results = tavily_search(message, max_results=self._max_results)
        except WebSearchError as exc:
            logger.info("Chat mode search failed: %s", exc)
            fallback = (
                "Tạm thời không thể tìm kiếm web, vui lòng thử lại sau. "
                f"(Chi tiết: {exc})"
            )
            return _fallback_state(fallback, warning=f"WebSearchError: {exc}")

        if not results:
            empty = (
                "Không tìm thấy kết quả web phù hợp cho câu hỏi của bạn. "
                "Thử lại với từ khóa khác hoặc chuyển sang chế độ Agent."
            )
            return _fallback_state(empty, warning=None)

        prompt = _build_prompt(message, results, context)
        try:
            answer_text = await self._llm(prompt)
        except Exception as exc:
            logger.warning("Chat mode LLM call failed: %s", exc)
            return _fallback_state(
                "Đã xảy ra lỗi khi tổng hợp câu trả lời. Vui lòng thử lại sau.",
                warning=f"LLMError: {type(exc).__name__}",
            )

        citations = _results_to_citations(results)
        return {
            "formatted_answer": answer_text,
            "verified_answer": answer_text,
            "reasoning_steps": [
                f"🌐 Tìm kiếm web (Tavily, {len(results)} kết quả)"
            ],
            "citations": [c["source"] for c in citations],
            "retrieved_sources": citations,
            "confidence_score": 0.7,
            "warnings": [],
        }


def _build_prompt(
    message: str,
    results: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> str:
    """Assemble the summarization prompt from search results."""
    numbered: List[str] = []
    for i, item in enumerate(results, start=1):
        title = item.get("title") or item.get("url") or f"Kết quả {i}"
        snippet = item.get("snippet") or item.get("content") or ""
        url = item.get("url") or ""
        numbered.append(f"[{i}] {title}\nURL: {url}\n{snippet}")

    prior = context.get("recent_history") if isinstance(context, dict) else None
    history_block = f"\n\nNGỮ CẢNH TRƯỚC:\n{prior}\n" if prior else ""

    return (
        f"{_SYSTEM_PROMPT}{history_block}\n\nCÂU HỎI: {message}\n\n"
        "KẾT QUẢ WEB SEARCH:\n" + "\n\n".join(numbered) + "\n\n"
        "Hãy tổng hợp câu trả lời dựa trên các kết quả trên."
    )


def _results_to_citations(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map Tavily results to the retrieved_sources shape used by the API layer."""
    out: List[Dict[str, Any]] = []
    for item in results:
        title = item.get("title") or item.get("url") or "Web source"
        snippet = item.get("snippet") or item.get("content") or ""
        out.append(
            {
                "title": title,
                "source": item.get("url") or title,
                "snippet": snippet,
                "content": item.get("content") or snippet,
            }
        )
    return out


def _fallback_state(message: str, warning: Optional[str]) -> Dict[str, Any]:
    return {
        "formatted_answer": message,
        "verified_answer": message,
        "reasoning_steps": ["🌐 Web search không khả dụng"],
        "citations": [],
        "retrieved_sources": [],
        "confidence_score": 0.0,
        "warnings": [warning] if warning else [],
    }
