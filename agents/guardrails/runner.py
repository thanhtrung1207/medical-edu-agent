"""Orchestration of all guardrail checks.

The :class:`GuardrailRunner` composes the individual guardrail components and
exposes two entry points:

* :meth:`GuardrailRunner.run_pre_checks` - runs BEFORE a response is generated
  (scope + input safety), so out-of-scope or emergency queries can be short
  circuited.
* :meth:`GuardrailRunner.run_post_checks` - runs AFTER a response is generated
  (hallucination, confidence, response safety), producing a final decision on
  whether the response may be shown.
"""

from __future__ import annotations

import logging

from .confidence_scorer import ConfidenceScorer
from .hallucination_detector import HallucinationDetector
from .models import DISCLAIMER_VI, GuardrailResult
from .safety_checker import MedicalSafetyChecker
from .scope_detector import ScopeDetector

logger = logging.getLogger(__name__)

# Response is blocked if hallucination risk meets/exceeds this threshold.
_HALLUCINATION_BLOCK_THRESHOLD = 0.7

# A warning (not a block) is emitted when confidence falls below this value.
_LOW_CONFIDENCE_THRESHOLD = 0.4


class GuardrailRunner:
    """Runs all guardrail checks on a response."""

    def __init__(self) -> None:
        """Instantiate all guardrail components."""
        self.hallucination_detector = HallucinationDetector()
        self.safety_checker = MedicalSafetyChecker()
        self.scope_detector = ScopeDetector()
        self.confidence_scorer = ConfidenceScorer()

    def run_pre_checks(self, user_input: str) -> GuardrailResult:
        """Run checks BEFORE generating a response.

        Evaluates scope and input safety so that out-of-scope queries and
        medical emergencies can be blocked/redirected before any response is
        generated.

        Args:
            user_input: The raw user query.

        Returns:
            A :class:`GuardrailResult`. When ``should_block`` is True the caller
            should return ``block_reason`` / disclaimer instead of generating a
            response.
        """
        scope = self.scope_detector.check(user_input)
        # Safety check on input alone (response not yet generated).
        safety = self.safety_checker.check(response="", user_input=user_input)

        warnings: list[str] = []
        should_block = False
        block_reason: str | None = None

        if safety.is_emergency:
            should_block = True
            block_reason = safety.redirect_message
            warnings.append("Phát hiện tình huống khẩn cấp trong câu hỏi.")
        elif not scope.is_in_scope:
            should_block = True
            block_reason = scope.redirect_message
            warnings.append(
                f"Câu hỏi ngoài phạm vi giáo dục (loại: {scope.detected_category})."
            )

        result = GuardrailResult(
            is_safe=safety.is_safe and scope.is_in_scope,
            confidence_score=0.0,  # not applicable pre-generation
            hallucination_risk=0.0,  # not applicable pre-generation
            is_in_scope=scope.is_in_scope,
            warnings=warnings,
            disclaimer=DISCLAIMER_VI,
            should_block=should_block,
            block_reason=block_reason,
        )
        logger.info(
            "Pre-checks: in_scope=%s emergency=%s block=%s",
            scope.is_in_scope,
            safety.is_emergency,
            should_block,
        )
        return result

    def run_post_checks(
        self,
        response: str,
        sources: list,
        reasoning: list,
        user_input: str,
    ) -> GuardrailResult:
        """Run checks AFTER generating a response.

        Evaluates hallucination risk, confidence, and response-level safety,
        then combines them into a final decision.

        Args:
            response: The generated response text.
            sources: Source snippets used to ground the response.
            reasoning: Reasoning/chain-of-thought steps taken.
            user_input: The original user query.

        Returns:
            A combined :class:`GuardrailResult`.
        """
        sources = list(sources or [])
        reasoning = list(reasoning or [])

        hallucination = self.hallucination_detector.detect(response, sources)
        confidence = self.confidence_scorer.score(response, sources, reasoning)
        safety = self.safety_checker.check(response=response, user_input=user_input)

        warnings: list[str] = []
        should_block = False
        block_reason: str | None = None

        # Safety violations / emergencies are hard blocks.
        if safety.is_emergency:
            should_block = True
            block_reason = safety.redirect_message
            warnings.append("Phát hiện tình huống khẩn cấp.")
        if safety.violations:
            should_block = True
            block_reason = block_reason or (
                "Câu trả lời vi phạm quy tắc an toàn y khoa: "
                + "; ".join(safety.violations)
            )
            warnings.extend(safety.violations)

        # High hallucination risk is a hard block ONLY when real grounding
        # sources are available (documents uploaded to knowledge base). Without
        # real sources, the detector cannot meaningfully assess hallucination
        # (the model relies on its training knowledge), so we downgrade to a
        # warning rather than blocking the response entirely.
        has_real_sources = bool(sources)
        if hallucination.risk_score >= _HALLUCINATION_BLOCK_THRESHOLD and has_real_sources:
            should_block = True
            block_reason = block_reason or (
                "Nguy cơ bịa đặt thông tin cao "
                f"(risk={hallucination.risk_score:.2f}); "
                "câu trả lời chưa được nguồn tin cậy hỗ trợ đầy đủ."
            )
            warnings.append(
                f"Nguy cơ hallucination cao: {hallucination.risk_score:.2f}"
            )
        elif hallucination.risk_score >= _HALLUCINATION_BLOCK_THRESHOLD:
            # No real sources — advisory warning only, do NOT block.
            warnings.append(
                "Chưa có tài liệu trong knowledge base để kiểm chứng. "
                "Hãy upload tài liệu y khoa để tăng độ tin cậy."
            )

        # Low confidence is advisory, not blocking.
        if confidence.score < _LOW_CONFIDENCE_THRESHOLD:
            warnings.append(
                f"Độ tin cậy thấp: {confidence.score:.2f}. "
                + "; ".join(confidence.recommendations)
            )

        result = GuardrailResult(
            is_safe=safety.is_safe,
            confidence_score=confidence.score,
            hallucination_risk=hallucination.risk_score,
            is_in_scope=True,  # scope is evaluated in pre-checks
            warnings=list(dict.fromkeys(warnings)),
            disclaimer=safety.redirect_message or DISCLAIMER_VI,
            should_block=should_block,
            block_reason=block_reason,
        )
        logger.info(
            "Post-checks: safe=%s conf=%.2f halluc=%.2f block=%s",
            result.is_safe,
            result.confidence_score,
            result.hallucination_risk,
            should_block,
        )
        return result
