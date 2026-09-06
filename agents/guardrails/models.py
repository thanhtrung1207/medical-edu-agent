"""Data models and shared constants for the guardrails module.

Defines the report dataclasses returned by each guardrail component as well as
the combined :class:`GuardrailResult` and the standard Vietnamese medical
disclaimer constant ``DISCLAIMER_VI``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Standard medical disclaimer (Vietnamese). Appended to educational responses
# to remind users the content is for study purposes only.
DISCLAIMER_VI: str = (
    "⚠️ Lưu ý: Thông tin này chỉ dành cho mục đích học tập và giáo dục y khoa. "
    "Không sử dụng để tự chẩn đoán hoặc điều trị. Hãy tham khảo ý kiến bác sĩ "
    "cho các vấn đề sức khỏe cụ thể."
)

# Standard message used when redirecting a suspected medical emergency to
# professional / emergency services.
EMERGENCY_REDIRECT_VI: str = (
    "🚨 Đây có thể là tình huống khẩn cấp. Vui lòng gọi cấp cứu 115 (hoặc số "
    "cấp cứu tại địa phương của bạn) ngay lập tức, hoặc đến cơ sở y tế gần "
    "nhất. Nếu bạn đang có ý định tự làm hại bản thân, hãy liên hệ đường dây "
    "nóng hỗ trợ tâm lý hoặc người thân đáng tin cậy ngay."
)


@dataclass
class HallucinationReport:
    """Result of hallucination detection on a response.

    Attributes:
        risk_score: Overall hallucination risk, 0.0 (no risk) to 1.0 (high risk).
        flagged_statements: Claims not supported by any provided source.
        supported_statements: Claims backed by at least one source.
        total_claims: Total number of claims extracted from the response.
    """

    risk_score: float
    flagged_statements: list[str]
    supported_statements: list[str]
    total_claims: int


@dataclass
class SafetyReport:
    """Result of the medical safety check.

    Attributes:
        is_safe: Whether the response complies with all safety rules.
        violations: Human-readable descriptions of any violated safety rules.
        is_emergency: Whether emergency keywords were detected in the input.
        disclaimer: Disclaimer text to append, if any.
        redirect_message: Message redirecting the user (e.g. to emergency
            services), if applicable.
    """

    is_safe: bool
    violations: list[str]
    is_emergency: bool
    disclaimer: str | None
    redirect_message: str | None


@dataclass
class ScopeReport:
    """Result of the educational scope detection.

    Attributes:
        is_in_scope: Whether the query falls within the agent's educational scope.
        detected_category: Best-matching category label.
        confidence: Confidence of the categorization, 0.0 - 1.0.
        redirect_message: Message shown when the query is out of scope, if any.
    """

    is_in_scope: bool
    detected_category: str
    confidence: float
    redirect_message: str | None


@dataclass
class ConfidenceReport:
    """Result of confidence scoring on a response.

    Attributes:
        score: Overall confidence, 0.0 - 1.0.
        source_coverage: Contribution from source grounding (0.0 - 0.4).
        reasoning_quality: Contribution from reasoning completeness (0.0 - 0.3).
        consistency_score: Contribution from medical-fact consistency (0.0 - 0.3).
        recommendations: Suggested actions to improve or caveat the answer.
    """

    score: float
    source_coverage: float
    reasoning_quality: float
    consistency_score: float
    recommendations: list[str]


@dataclass
class GuardrailResult:
    """Combined result from all guardrail checks.

    Attributes:
        is_safe: Whether the response/input is considered safe.
        confidence_score: Aggregate confidence in the response (0.0 - 1.0).
        hallucination_risk: Aggregate hallucination risk (0.0 - 1.0).
        is_in_scope: Whether the query is within educational scope.
        warnings: Non-blocking advisory messages.
        disclaimer: Disclaimer to surface to the user, if any.
        should_block: Whether the response must be blocked/replaced.
        block_reason: Explanation for blocking, if ``should_block`` is True.
    """

    is_safe: bool
    confidence_score: float
    hallucination_risk: float
    is_in_scope: bool
    warnings: list[str] = field(default_factory=list)
    disclaimer: str | None = None
    should_block: bool = False
    block_reason: str | None = None
