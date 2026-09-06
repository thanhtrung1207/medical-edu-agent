"""Anatomy Tool - Anatomical Reference Lookup.

This tool provides anatomical reference information (structures,
relationships, and functions) from the medical knowledge base to support
educational explanations.
"""

from __future__ import annotations

import logging
from typing import Dict

from .medical_search import format_citations, retrieve

logger = logging.getLogger(__name__)

# Recognized body systems mapped to Vietnamese query hints.
_SYSTEM_HINTS: Dict[str, str] = {
    "musculoskeletal": "hệ cơ xương khớp",
    "cardiovascular": "hệ tim mạch",
    "nervous": "hệ thần kinh",
    "respiratory": "hệ hô hấp",
    "digestive": "hệ tiêu hóa",
    "urinary": "hệ tiết niệu",
    "endocrine": "hệ nội tiết",
    "reproductive": "hệ sinh dục",
    "lymphatic": "hệ bạch huyết",
    "integumentary": "hệ da",
}


def search_anatomy(structure: str, system: str = "general") -> str:
    """Search anatomy reference information.

    Args:
        structure: Anatomical structure name (Vietnamese or English).
        system: Body system (musculoskeletal, cardiovascular, nervous, etc.).
            Use ``"general"`` for no specific system.

    Returns:
        Formatted, cited Vietnamese description of the anatomical structure,
        or a helpful message if nothing is found.
    """
    structure = (structure or "").strip()
    if not structure:
        return "Vui lòng cung cấp tên cấu trúc giải phẫu cần tra cứu."

    system = (system or "general").strip().lower()
    system_hint = _SYSTEM_HINTS.get(system, "")

    query = f"giải phẫu {structure}"
    if system_hint:
        query = f"{query} {system_hint}"

    hits = retrieve(query, top_k=5)

    # Retry without the system hint if the more specific query found nothing.
    if not hits and system_hint:
        hits = retrieve(f"giải phẫu {structure}", top_k=5)

    if not hits:
        return (
            f"Không tìm thấy thông tin giải phẫu về '{structure}' trong cơ sở tri thức. "
            f"Có thể chưa có tài liệu liên quan được nạp."
        )

    system_label = f" (thuộc {system_hint})" if system_hint else ""
    header = f"Thông tin giải phẫu: {structure}{system_label}"
    return f"{header}\n\n{format_citations(hits)}"
"""Anatomy Tool - Anatomical Reference Lookup.

This tool provides anatomical reference information (structures,
relationships, and functions) to support educational explanations.
"""
