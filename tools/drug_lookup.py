"""Drug Lookup Tool - Medication Information Retrieval.

This tool looks up drug information such as mechanism of action, indications,
side effects and interactions from the medical knowledge base to support
educational (not clinical prescribing) questions.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from .medical_search import format_citations, retrieve

logger = logging.getLogger(__name__)

_DISCLAIMER = "Thông tin chỉ dùng cho mục đích học tập"

# Supported info types mapped to Vietnamese query hints.
_INFO_TYPES: Dict[str, str] = {
    "mechanism": "cơ chế tác dụng dược lý",
    "indication": "chỉ định điều trị",
    "side_effects": "tác dụng phụ tác dụng không mong muốn",
    "interaction": "tương tác thuốc",
}

_INFO_LABELS: Dict[str, str] = {
    "mechanism": "Cơ chế tác dụng",
    "indication": "Chỉ định",
    "side_effects": "Tác dụng phụ",
    "interaction": "Tương tác thuốc",
}


def lookup_drug_info(drug_name: str, info_type: str = "all") -> str:
    """Look up drug information for educational purposes.

    Args:
        drug_name: Name of the drug (Vietnamese or international name).
        info_type: Type of info - 'mechanism', 'indication', 'side_effects',
            'interaction', 'all'.

    Returns:
        Educational, cited drug information as a formatted Vietnamese string,
        always appended with a study-only disclaimer.
    """
    drug_name = (drug_name or "").strip()
    if not drug_name:
        return "Vui lòng cung cấp tên thuốc cần tra cứu."

    info_type = (info_type or "all").strip().lower()
    if info_type not in _INFO_TYPES and info_type != "all":
        info_type = "all"

    sections: List[str] = []

    if info_type == "all":
        for key, hint in _INFO_TYPES.items():
            hits = retrieve(f"{drug_name} {hint}", top_k=3)
            if hits:
                sections.append(f"### {_INFO_LABELS[key]}\n{format_citations(hits)}")
    else:
        hits = retrieve(f"{drug_name} {_INFO_TYPES[info_type]}", top_k=5)
        if hits:
            sections.append(f"### {_INFO_LABELS[info_type]}\n{format_citations(hits)}")

    if not sections:
        return (
            f"Không tìm thấy thông tin về thuốc '{drug_name}' trong cơ sở tri thức. "
            f"Có thể chưa có tài liệu liên quan được nạp.\n\n"
            f"*{_DISCLAIMER}.*"
        )

    header = f"Thông tin thuốc: {drug_name}"
    body = "\n\n".join(sections)
    return f"{header}\n\n{body}\n\n*{_DISCLAIMER}.*"
"""Drug Lookup Tool - Medication Information Retrieval.

This tool looks up drug information such as indications, dosing,
contraindications, and interactions to support clinical questions.
"""
