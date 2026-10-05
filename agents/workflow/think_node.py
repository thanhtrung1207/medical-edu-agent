"""Think node — second stage of the medical reasoning workflow.

The Think node performs the *reasoning* step. Given the confirmed query it:
    * searches the knowledge base for relevant passages (placeholder tool call),
    * builds a step-by-step Chain-of-Thought reasoning chain,
    * estimates a confidence level for the reasoning.

Outputs written into the workflow state:
    * ``reasoning_steps`` (list[str]): ordered Chain-of-Thought steps.
    * ``relevant_sources`` (list[dict]): retrieved knowledge-base sources.
    * ``confidence_level`` (float): 0-1 self-assessed reasoning confidence.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from google.adk import Agent

from agents.model_config import get_primary_model

from ._runtime import (
    AgentRuntimeError,
    extract_json,
    format_history_snippet,
    format_retrieved_passages,
    run_agent,
)

__all__ = ["think_agent", "think_node", "search_knowledge_base"]

logger = logging.getLogger(__name__)

_THINK_INSTRUCTION = """Bạn là module SUY LUẬN (Think) trong quy trình suy luận của
một trợ lý AI giáo dục chuyên ngành RĂNG HÀM MẶT. Bạn suy luận như một GIÁO SƯ
nha khoa đang phân tích một ca lâm sàng: cân nhắc các chẩn đoán phân biệt và các
lựa chọn điều trị khả dĩ theo chuỗi suy luận từng bước (Chain-of-Thought).

Nguyên tắc:
1. Suy luận từng bước, rõ ràng, theo logic nha khoa dựa trên bằng chứng.
2. Liệt kê các chẩn đoán phân biệt / phương án điều trị khả dĩ, và với MỖI phương
   án hãy ước lượng XÁC SUẤT phù hợp (%) cùng lập luận ủng hộ và rủi ro/chống chỉ
   định.
3. Ưu tiên hướng dẫn nha khoa dựa trên bằng chứng (ITI, ADA, EAO) và các nguồn
   được cung cấp; không bịa đặt.
4. Nếu thiếu dữ kiện (ví dụ: tình trạng xương ổ, phim X-quang, chỉ số nha chu),
   nêu rõ giả định thay vì suy đoán vô căn cứ.
5. Cân nhắc ưu điểm/nhược điểm (pros/cons) của từng phương án theo tỉ lệ phần trăm.
6. Tự đánh giá độ tin cậy của chuỗi suy luận (confidence_level từ 0.0 đến 1.0).
7. Dùng tiếng Việt, giữ nguyên thuật ngữ Latin/English nha khoa.

CHỈ trả về JSON hợp lệ theo đúng cấu trúc sau, không thêm giải thích:
{
  "reasoning_steps": ["<bước 1>", "<bước 2>", "..."],
  "relevant_sources": ["<trích dẫn/nguồn đã dùng>", "..."],
  "confidence_level": <số thực từ 0.0 đến 1.0>
}
"""

# ADK agent responsible for the Think stage.
think_agent = Agent(
    name="think_node",
    model=get_primary_model(),
    instruction=_THINK_INSTRUCTION,
)


def search_knowledge_base(query: str, top_k: int = 5) -> list:
    """Search the ChromaDB vector store for relevant knowledge passages.

    Args:
        query: The search query (confirmed user question).
        top_k: Maximum number of results to retrieve.

    Returns:
        List of source dicts with title, snippet, source, content keys.
    """
    try:
        from tools.medical_search import retrieve

        hits = retrieve(query=query, top_k=top_k, where=None)
        if not hits:
            return []
        # Filter by distance threshold (cosine distance; lower = more similar).
        filtered = [
            hit
            for hit in hits
            if isinstance(hit.get("distance"), (int, float))
            and hit["distance"] <= 0.7
        ]
        # Limit to top 3 after filtering
        filtered = filtered[:3]
        sources = []
        for hit in filtered:
            text = hit.get("text") or ""
            metadata = hit.get("metadata") or {}
            source_file = metadata.get("source_file", metadata.get("document_id", "Unknown"))
            sources.append({
                "title": source_file,
                "snippet": text[:300],
                "source": source_file,
                "content": text,
            })
        return sources
    except Exception as e:
        logger.warning("Knowledge base search failed: %s", e)
        return []


def _heuristic_reasoning(confirmed_query: str, sources: List[Dict]) -> Dict:
    """Deterministic fallback reasoning used when the LLM is unavailable.

    Args:
        confirmed_query: The confirmed query from the Confirm node.
        sources: Sources returned by :func:`search_knowledge_base`.

    Returns:
        A dict with ``reasoning_steps``, ``relevant_sources`` and
        ``confidence_level``.
    """
    steps = [
        f"Xác định trọng tâm câu hỏi: {confirmed_query}.",
        "Truy xuất các nguồn liên quan từ knowledge base.",
        "Đối chiếu thông tin từ nguồn với kiến thức y khoa nền tảng.",
        "Tổng hợp các luận điểm chính để chuẩn bị câu trả lời.",
    ]
    return {
        "reasoning_steps": steps,
        "relevant_sources": [s.get("source", "") for s in sources],
        # Lower confidence because no LLM reasoning was performed.
        "confidence_level": 0.5,
    }


async def think_node(state: Dict) -> Dict:
    """Perform step-by-step reasoning over the confirmed query.

    Reads ``state["confirmed_query"]`` (and ``specialty``), searches the
    knowledge base, and writes ``reasoning_steps``, ``relevant_sources`` and
    ``confidence_level`` back into the state.

    Args:
        state: The mutable workflow state dictionary.

    Returns:
        The updated state dictionary.
    """
    confirmed_query = state.get("confirmed_query", state.get("user_input", ""))
    specialty = state.get("specialty", "general")

    # Retrieve grounding sources via the real ChromaDB knowledge-base search.
    sources = search_knowledge_base(confirmed_query)
    sources_text = format_retrieved_passages(sources)

    history = state.get("context", {}).get("conversation_history", [])
    # Exclude the last message (current turn) to avoid duplication
    history = history[:-1] if history else []
    history_snippet = format_history_snippet(history)

    prompt = (
        f"Câu hỏi đã xác nhận:\n{confirmed_query}\n\n"
        f"Chuyên khoa: {specialty}\n\n"
        f"Các nguồn tham khảo từ knowledge base:\n{sources_text}"
    )
    if history_snippet:
        prompt += (
            f"\n\n--- LỊCH SỬ HỘI THOẠI ---\n{history_snippet}"
            "\n--- HẾT LỊCH SỬ ---"
        )

    try:
        raw = await run_agent(think_agent, prompt)
        parsed = extract_json(raw, default=None)
        if not isinstance(parsed, dict):
            raise AgentRuntimeError("Think agent did not return a JSON object.")

        reasoning_steps = parsed.get("reasoning_steps") or []
        if not isinstance(reasoning_steps, list):
            reasoning_steps = [str(reasoning_steps)]

        relevant_sources = parsed.get("relevant_sources") or [
            s.get("source", "") for s in sources
        ]
        if not isinstance(relevant_sources, list):
            relevant_sources = [str(relevant_sources)]

        try:
            confidence_level = float(parsed.get("confidence_level", 0.6))
        except (TypeError, ValueError):
            confidence_level = 0.6
        confidence_level = max(0.0, min(1.0, confidence_level))

        result = {
            "reasoning_steps": [str(s) for s in reasoning_steps],
            "relevant_sources": relevant_sources,
            "confidence_level": confidence_level,
        }
    except AgentRuntimeError:
        result = _heuristic_reasoning(confirmed_query, sources)

    state["reasoning_steps"] = result["reasoning_steps"]
    state["relevant_sources"] = result["relevant_sources"]
    state["confidence_level"] = result["confidence_level"]
    # Keep the full source objects available for the Answer node's citations.
    state["retrieved_sources"] = sources
    return state
