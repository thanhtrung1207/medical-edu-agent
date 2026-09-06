"""Educational scope detection for the medical agent.

Determines whether a user query falls within the agent's medical-education
scope or should be redirected (e.g. requests for real diagnosis, prescriptions,
legal advice, or non-medical topics). Uses keyword scoring per category.
"""

from __future__ import annotations

import logging

from ._text import normalize
from .models import DISCLAIMER_VI, ScopeReport

logger = logging.getLogger(__name__)

# Redirect message shown when a query is out of the educational scope.
_OUT_OF_SCOPE_REDIRECT_VI = (
    "Xin lỗi, tôi là trợ lý giáo dục nha khoa và chỉ hỗ trợ các câu hỏi phục vụ "
    "mục đích học tập (răng, phục hình, implant, Răng Hàm Mặt, ca lâm sàng nha khoa "
    "mô phỏng, ôn thi...). Với các vấn đề sức khỏe cá nhân, chẩn đoán hoặc kê đơn "
    "thực tế, vui lòng liên hệ bác sĩ hoặc cơ sở y tế. " + DISCLAIMER_VI
)


class ScopeDetector:
    """Detects if a question is within the agent's educational scope."""

    IN_SCOPE = [
        "medical_education", "anatomy", "physiology", "pathology",
        "pharmacology", "microbiology", "biochemistry", "clinical_medicine",
        "surgery", "pediatrics", "obstetrics", "internal_medicine",
        "medical_terminology", "exam_preparation", "clinical_cases",
        "dentistry", "prosthodontics", "periodontics", "implantology",
        "orthodontics", "endodontics", "oral_surgery",
    ]

    OUT_OF_SCOPE = [
        "real_patient_diagnosis", "prescription_request", "legal_advice",
        "non_medical_topics", "personal_health_advice", "mental_health_crisis",
    ]

    # Keyword banks (Vietnamese + English) mapped to each in-scope category.
    _IN_SCOPE_KEYWORDS: dict[str, list[str]] = {
        "anatomy": ["giải phẫu", "anatomy", "cơ quan", "xương", "cơ ", "mạch máu"],
        "physiology": ["sinh lý", "physiology", "chức năng", "cân bằng nội môi"],
        "pathology": ["giải phẫu bệnh", "pathology", "bệnh học", "tổn thương mô"],
        "pharmacology": [
            "dược lý", "pharmacology", "cơ chế thuốc", "tác dụng của thuốc",
            "nhóm thuốc",
        ],
        "microbiology": ["vi sinh", "microbiology", "vi khuẩn", "virus", "nấm"],
        "biochemistry": ["hóa sinh", "biochemistry", "chuyển hóa", "enzyme"],
        "clinical_medicine": ["lâm sàng", "clinical", "triệu chứng học", "hội chứng"],
        "surgery": ["ngoại khoa", "surgery", "phẫu thuật", "mổ"],
        "pediatrics": ["nhi khoa", "pediatrics", "trẻ em", "sơ sinh"],
        "obstetrics": ["sản khoa", "obstetrics", "thai kỳ", "sản phụ"],
        "internal_medicine": ["nội khoa", "internal medicine", "bệnh nội"],
        "medical_terminology": ["thuật ngữ y khoa", "medical term", "định nghĩa y"],
        "exam_preparation": [
            "ôn thi", "exam", "usmle", "trắc nghiệm", "câu hỏi ôn tập",
            "đề thi",
        ],
        "clinical_cases": [
            "ca lâm sàng", "clinical case", "case study", "tình huống bệnh",
            "ca bệnh mô phỏng", "bệnh nhân", "tiền sử", "phác đồ",
            "chẩn đoán", "điều trị",
        ],
        "medical_education": [
            "giáo dục y khoa", "học y", "sinh viên y", "bài giảng", "y khoa",
        ],
        "dentistry": [
            "răng", "nha khoa", "implant", "cầu răng", "phục hình",
            "nha chu", "tiêu xương", "lung lay", "nhổ răng", "sâu răng",
            "tủy", "nướu", "khớp cắn", "mão răng", "chỉnh nha",
            "nội nha", "cắm ghép", "xương ổ", "mất răng", "răng trụ",
            "hàm", "prosthodontics", "periodontics", "endodontics",
        ],
    }

    # Keyword banks mapped to each out-of-scope category.
    _OUT_OF_SCOPE_KEYWORDS: dict[str, list[str]] = {
        "real_patient_diagnosis": [
            "chẩn đoán giúp tôi", "tôi bị bệnh gì", "tôi có bị", "chẩn đoán cho tôi",
            "diagnose me", "what disease do i have",
        ],
        "prescription_request": [
            "kê đơn cho tôi", "tôi nên uống thuốc gì", "cho tôi đơn thuốc",
            "liều dùng cho tôi", "prescribe me", "what medicine should i take",
        ],
        "personal_health_advice": [
            "tôi nên làm gì", "sức khỏe của tôi", "tình trạng của tôi",
            "tôi phải làm sao", "should i", "my health",
        ],
        "mental_health_crisis": [
            "tự tử", "muốn chết", "suicide", "tự làm hại", "không muốn sống",
        ],
        "legal_advice": [
            "tư vấn pháp lý", "kiện tụng", "luật sư", "legal advice", "lawsuit",
            "hợp đồng pháp lý", "khiếu kiện",
        ],
        "non_medical_topics": [
            "thời tiết", "bóng đá", "chứng khoán", "nấu ăn", "du lịch",
            "weather", "football", "stock", "recipe",
        ],
    }

    def check(self, user_input: str) -> ScopeReport:
        """Determine whether the query is within educational scope.

        Args:
            user_input: The user's query text.

        Returns:
            A :class:`ScopeReport` with the in/out-of-scope decision, the best
            matching category, a confidence score, and a redirect message when
            out of scope.
        """
        norm_input = normalize(user_input)
        if not norm_input:
            return ScopeReport(
                is_in_scope=False,
                detected_category="non_medical_topics",
                confidence=0.0,
                redirect_message=_OUT_OF_SCOPE_REDIRECT_VI,
            )

        out_category, out_hits = self._best_category(
            norm_input, self._OUT_OF_SCOPE_KEYWORDS
        )
        in_category, in_hits = self._best_category(
            norm_input, self._IN_SCOPE_KEYWORDS
        )

        # Out-of-scope signals take precedence: even if a query mentions medical
        # terms, an explicit request for personal diagnosis/prescription must be
        # redirected.
        if out_hits > 0:
            confidence = self._confidence(out_hits)
            logger.info(
                "Query classified OUT of scope as '%s' (hits=%d)",
                out_category,
                out_hits,
            )
            return ScopeReport(
                is_in_scope=False,
                detected_category=out_category,
                confidence=confidence,
                redirect_message=_OUT_OF_SCOPE_REDIRECT_VI,
            )

        if in_hits > 0:
            confidence = self._confidence(in_hits)
            return ScopeReport(
                is_in_scope=True,
                detected_category=in_category,
                confidence=confidence,
                redirect_message=None,
            )

        # No clear signal either way: default to in-scope with low confidence so
        # the educational agent can still attempt an answer, but flag uncertainty.
        logger.info("Query scope ambiguous; defaulting to in-scope (low conf).")
        return ScopeReport(
            is_in_scope=True,
            detected_category="medical_education",
            confidence=0.25,
            redirect_message=None,
        )

    def _best_category(
        self, norm_input: str, keyword_banks: dict[str, list[str]]
    ) -> tuple[str, int]:
        """Return the category with the most keyword hits and the hit count."""
        best_category = ""
        best_hits = 0
        for category, keywords in keyword_banks.items():
            hits = sum(1 for kw in keywords if normalize(kw) in norm_input)
            if hits > best_hits:
                best_hits = hits
                best_category = category
        return best_category, best_hits

    def _confidence(self, hits: int) -> float:
        """Map a keyword hit count to a confidence score in [0.0, 1.0]."""
        # Diminishing returns: 1 hit -> 0.6, 2 -> 0.8, 3+ -> ~0.9+.
        return round(min(1.0, 0.4 + 0.2 * hits), 3)
