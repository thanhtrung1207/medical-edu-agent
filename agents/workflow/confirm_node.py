"""Confirm node — first stage of the medical reasoning workflow.

The Confirm node receives the raw user input and *confirms understanding*
before any reasoning happens. It paraphrases the question, classifies its type
and identifies the relevant medical specialty. This mirrors the mandated
reasoning flow: **Confirm → Think → Answer → Verify**.

Outputs written into the workflow state:
    * ``confirmed_query`` (str): a paraphrase confirming what was understood.
    * ``question_type`` (str): one of the values in :data:`QUESTION_TYPES`.
    * ``specialty`` (str): the relevant medical specialty (Vietnamese label).
"""

from __future__ import annotations

from typing import Dict

from google.adk import Agent

from agents.model_config import get_primary_model
from agents.workflow.command_hints import (
    build_clinical_context_block,
    build_command_block,
)

from ._runtime import AgentRuntimeError, extract_json, format_history_snippet, run_agent

__all__ = ["confirm_agent", "confirm_node", "QUESTION_TYPES"]

# Canonical question types recognised by the workflow.
QUESTION_TYPES = (
    "greeting",
    "factual",
    "clinical",
    "procedural",
    "quiz_request",
    "case_study",
)

_CONFIRM_INSTRUCTION = """Bạn là module XÁC NHẬN (Confirm) trong quy trình suy luận
của một trợ lý AI giáo dục chuyên ngành RĂNG HÀM MẶT. Nhiệm vụ của bạn KHÔNG
phải trả lời câu hỏi, mà là xác nhận rằng bạn đã hiểu đúng yêu cầu của sinh viên.

## QUY TẮC QUAN TRỌNG:
- Nếu đầu vào là LỜI CHÀO đơn giản (hello, xin chào, hi, chào bạn...),
  phân loại là "greeting" và diễn giải ngắn gọn: "Sinh viên chào hỏi."
  KHÔNG yêu cầu thêm thông tin, KHÔNG phân tích phức tạp.

Với câu hỏi CHUYÊN MÔN (không phải lời chào), hãy:
1. Diễn giải lại (paraphrase) câu hỏi bằng tiếng Việt rõ ràng, ngắn gọn để xác
   nhận cách hiểu. Giữ nguyên thuật ngữ Latin/English nha khoa chuyên môn.
2. Phân loại câu hỏi vào ĐÚNG MỘT trong các loại sau:
   - "factual": câu hỏi kiến thức nha khoa thuần túy (định nghĩa, cơ chế, phân loại...).
   - "clinical": câu hỏi lâm sàng nha khoa (chẩn đoán phân biệt, lựa chọn điều trị,
     tiên lượng...).
   - "procedural": câu hỏi về quy trình/thủ thuật nha khoa (ví dụ: cắm implant,
     lấy tuỷ, phẫu thuật nhổ răng khôn...).
   - "quiz_request": yêu cầu tạo câu hỏi trắc nghiệm/đề luyện tập nha khoa.
   - "case_study": tình huống/ca lâm sàng nha khoa cần phân tích.
3. Xác định phân ngành nha khoa liên quan (ví dụ: "Implant", "Phục hình",
   "Nha chu", "Chỉnh nha", "Phẫu thuật miệng - hàm mặt", "Nội nha"...). Nếu
   không rõ, dùng "Tổng quát".
4. Nếu có dữ liệu ca lâm sàng, xác nhận cách hiểu về dữ liệu đó; nếu thông tin
   chưa đầy đủ, nêu rõ những dữ kiện còn thiếu cần làm rõ (ví dụ: tình trạng
   xương ổ, chỉ số nha chu, phim X-quang) ngay trong phần diễn giải lại.

CHỈ trả về JSON hợp lệ theo đúng cấu trúc sau, không thêm giải thích:
{
  "confirmed_query": "<diễn giải lại câu hỏi>",
  "question_type": "<một trong: factual|clinical|procedural|quiz_request|case_study>",
  "specialty": "<phân ngành nha khoa liên quan>"
}
"""

# ADK agent responsible for the Confirm stage.
confirm_agent = Agent(
    name="confirm_node",
    model=get_primary_model(),
    instruction=_CONFIRM_INSTRUCTION,
)


def _heuristic_classify(user_input: str) -> Dict[str, str]:
    """Deterministic fallback classification used when the LLM is unavailable.

    Args:
        user_input: The raw user question.

    Returns:
        A dict with ``confirmed_query``, ``question_type`` and ``specialty``.
    """
    text = (user_input or "").lower()

    if any(k in text for k in ("trắc nghiệm", "quiz", "mcq", "câu hỏi ôn", "đề thi")):
        question_type = "quiz_request"
    elif any(k in text for k in ("ca lâm sàng", "bệnh nhân", "case", "tình huống")):
        question_type = "case_study"
    elif any(k in text for k in ("quy trình", "thủ thuật", "kỹ thuật", "các bước", "cách làm")):
        question_type = "procedural"
    elif any(k in text for k in ("chẩn đoán", "xử trí", "điều trị", "tiên lượng", "phác đồ")):
        question_type = "clinical"
    else:
        question_type = "factual"

    specialty_map = {
        "Dược lý": ("thuốc", "dược", "liều", "kháng sinh"),
        "Giải phẫu": ("giải phẫu", "anatomy", "cấu trúc"),
        "Sinh lý": ("sinh lý", "physiology", "cơ chế"),
        "Tim mạch": ("tim", "mạch", "huyết áp", "nhồi máu"),
        "Hô hấp": ("phổi", "hô hấp", "viêm phổi"),
        "Nhi khoa": ("trẻ em", "nhi", "sơ sinh"),
        "Sản phụ khoa": ("sản", "thai", "phụ khoa"),
    }
    specialty = "Tổng quát"
    for label, keywords in specialty_map.items():
        if any(k in text for k in keywords):
            specialty = label
            break

    return {
        "confirmed_query": (user_input or "").strip(),
        "question_type": question_type,
        "specialty": specialty,
    }


async def confirm_node(state: Dict) -> Dict:
    """Confirm understanding of the user's question.

    Reads ``state["user_input"]`` and writes ``confirmed_query``,
    ``question_type`` and ``specialty`` back into the state.

    Args:
        state: The mutable workflow state dictionary.

    Returns:
        The updated state dictionary.
    """
    user_input = state.get("user_input", "")
    context = state.get("context", {})
    context = context if isinstance(context, dict) else {}
    history = context.get("conversation_history", [])
    # Exclude the last message (current turn) to avoid duplication
    history = history[:-1] if isinstance(history, list) and history else []
    history_snippet = format_history_snippet(history)
    command = context.get("command", "")
    clinical_context = context.get("clinical_context", "")
    context_prefix = "\n\n".join(
        block
        for block in (
            build_command_block(command) if isinstance(command, str) else "",
            build_clinical_context_block(clinical_context)
            if isinstance(clinical_context, str)
            else "",
        )
        if block
    )
    prompt = "\n\n".join(
        part
        for part in (context_prefix, f"Câu hỏi của người dùng:\n{user_input}")
        if part
    )
    if history_snippet:
        prompt += (
            f"\n\n--- LỊCH SỬ HỘI THOẠI ---\n{history_snippet}"
            "\n--- HẾT LỊCH SỬ ---"
        )

    result: Dict[str, str]
    try:
        raw = await run_agent(confirm_agent, prompt)
        parsed = extract_json(raw, default=None)
        if not isinstance(parsed, dict):
            raise AgentRuntimeError("Confirm agent did not return a JSON object.")
        result = {
            "confirmed_query": str(parsed.get("confirmed_query") or user_input).strip(),
            "question_type": str(parsed.get("question_type") or "factual").strip(),
            "specialty": str(parsed.get("specialty") or "Tổng quát").strip(),
        }
    except AgentRuntimeError:
        result = _heuristic_classify(user_input)

    # Guard against an out-of-vocabulary question type.
    if result["question_type"] not in QUESTION_TYPES:
        result["question_type"] = "factual"

    state["confirmed_query"] = result["confirmed_query"]
    state["question_type"] = result["question_type"]
    state["specialty"] = result["specialty"]
    return state
