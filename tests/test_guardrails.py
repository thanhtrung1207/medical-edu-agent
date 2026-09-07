"""Tests for the safety guardrails module.

Importing ``agents.guardrails.*`` triggers ``agents/__init__.py`` which builds
the root agent and therefore requires ``google-adk``. The whole module is
skipped when that dependency is unavailable.
"""

from __future__ import annotations

import pytest

pytest.importorskip("google.adk")

from agents.guardrails.confidence_scorer import ConfidenceScorer  # noqa: E402
from agents.guardrails.hallucination_detector import (  # noqa: E402
    HallucinationDetector,
)
from agents.guardrails.runner import GuardrailRunner  # noqa: E402
from agents.guardrails.safety_checker import MedicalSafetyChecker  # noqa: E402
from agents.guardrails.scope_detector import ScopeDetector  # noqa: E402


class TestHallucinationDetector:
    def test_grounded_response_low_risk(self):
        """Response backed by sources should have low hallucination risk."""
        detector = HallucinationDetector()
        sources = ["Nhồi máu cơ tim gây đau ngực dữ dội và khó thở."]
        response = "Nhồi máu cơ tim gây đau ngực dữ dội và khó thở."

        report = detector.detect(response, sources)

        assert report.risk_score < 0.5
        assert report.flagged_statements == []
        assert report.supported_statements

    def test_ungrounded_response_high_risk(self):
        """Response with no source backing should have high risk."""
        detector = HallucinationDetector()
        response = (
            "Uống nước chanh mỗi sáng chữa khỏi hoàn toàn ung thư giai đoạn cuối."
        )

        report = detector.detect(response, sources=[])

        assert report.risk_score >= 0.7
        assert report.flagged_statements

    def test_partial_grounding(self):
        """Some claims grounded, some not."""
        detector = HallucinationDetector()
        sources = ["Nhồi máu cơ tim gây đau ngực dữ dội và khó thở."]
        response = (
            "Nhồi máu cơ tim gây đau ngực dữ dội và khó thở. "
            "Uống nước chanh mỗi sáng chữa khỏi hoàn toàn bệnh này thần kỳ."
        )

        report = detector.detect(response, sources)

        assert 0.0 < report.risk_score < 1.0
        assert report.flagged_statements
        assert report.supported_statements


class TestSafetyChecker:
    def test_safe_educational_content(self):
        """Normal educational Q&A should pass."""
        checker = MedicalSafetyChecker()

        report = checker.check(
            response="Nhồi máu cơ tim là tình trạng hoại tử cơ tim do thiếu máu.",
            user_input="Nhồi máu cơ tim là gì?",
        )

        assert report.is_safe
        assert report.violations == []
        assert not report.is_emergency

    def test_detect_real_diagnosis_attempt(self):
        """Detect when user asks for real medical diagnosis."""
        checker = MedicalSafetyChecker()

        report = checker.check(
            response="Bạn bị viêm phổi rồi, hãy dùng liều kháng sinh này.",
            user_input="Tôi bị sốt và ho, chẩn đoán giúp tôi với.",
        )

        assert not report.is_safe
        assert report.violations

    def test_emergency_keyword_detection(self):
        """Detect emergency keywords (tự tử, đau ngực dữ dội, etc.)."""
        checker = MedicalSafetyChecker()

        report = checker.check(
            response="",
            user_input="Tôi bị đau ngực dữ dội và khó thở, phải làm sao?",
        )

        assert report.is_emergency
        assert not report.is_safe
        assert report.redirect_message

    def test_prescription_detection(self):
        """Detect when response contains prescription-like content."""
        checker = MedicalSafetyChecker()

        report = checker.check(
            response="Bạn nên uống paracetamol 500mg để hạ sốt.",
            user_input="Sốt thì nên làm gì?",
        )

        assert not report.is_safe
        assert MedicalSafetyChecker.SAFETY_RULES[1] in report.violations


class TestScopeDetector:
    def test_in_scope_medical_question(self):
        """Medical education questions should be in scope."""
        detector = ScopeDetector()

        report = detector.check("Giải phẫu của tim gồm những phần nào?")

        assert report.is_in_scope
        assert report.detected_category == "anatomy"

    def test_out_of_scope_non_medical(self):
        """Non-medical questions should be out of scope."""
        detector = ScopeDetector()

        report = detector.check("Thời tiết hôm nay thế nào?")

        assert not report.is_in_scope
        assert report.detected_category == "non_medical_topics"
        assert report.redirect_message

    def test_borderline_personal_health(self):
        """Personal health questions should be flagged."""
        detector = ScopeDetector()

        report = detector.check("Tôi nên làm gì với sức khỏe của tôi?")

        assert not report.is_in_scope
        assert report.detected_category == "personal_health_advice"


class TestGuardrailRunner:
    def test_full_pre_check_pass(self):
        """Normal educational input passes pre-checks."""
        runner = GuardrailRunner()

        result = runner.run_pre_checks("Giải phẫu của tim gồm những phần nào?")

        assert not result.should_block
        assert result.is_in_scope

    def test_full_pre_check_block(self):
        """Emergency/dangerous input gets blocked."""
        runner = GuardrailRunner()

        result = runner.run_pre_checks(
            "Tôi bị đau ngực dữ dội, tôi phải làm gì?"
        )

        assert result.should_block
        assert result.block_reason

    def test_full_post_check_pass(self):
        """Well-grounded response passes post-checks."""
        runner = GuardrailRunner()
        sources = [
            "Nhồi máu cơ tim gây đau ngực dữ dội, khó thở và vã mồ hôi."
        ]
        response = "Nhồi máu cơ tim gây đau ngực dữ dội, khó thở và vã mồ hôi."
        reasoning = [
            "Xác định triệu chứng chính của bệnh",
            "Đối chiếu với nguồn tài liệu y khoa",
            "Tổng hợp thành câu trả lời hoàn chỉnh",
        ]

        result = runner.run_post_checks(
            response, sources, reasoning, "Triệu chứng nhồi máu cơ tim?"
        )

        assert not result.should_block
        assert result.hallucination_risk < 0.7

    def test_full_post_check_block_hallucination(self):
        """Highly hallucinated response gets blocked."""
        runner = GuardrailRunner()
        response = (
            "Uống nước chanh mỗi sáng chữa khỏi hoàn toàn mọi loại ung thư."
        )

        result = runner.run_post_checks(
            response, sources=[], reasoning=[], user_input="Ung thư là gì?"
        )

        assert result.should_block
        assert result.hallucination_risk >= 0.7

    def test_post_check_blocks_unsupported_claim_with_real_source(self):
        """A real source must not let an unrelated claim bypass the hard block."""
        runner = GuardrailRunner()
        source = "Ferrule là mô răng lành còn lại quanh cổ răng sau điều trị nội nha."
        response = "Đặt trụ sợi luôn giúp răng tồn tại chính xác 50 năm."

        result = runner.run_post_checks(
            response,
            sources=[source],
            reasoning=["Đối chiếu với tài liệu ferrule."],
            user_input="Trong học tập, ferrule là gì?",
        )

        assert result.should_block
        assert result.hallucination_risk >= 0.7


class TestConfidenceScorer:
    def test_high_confidence_grounded(self):
        """Grounded, well-reasoned response scores higher than an empty one."""
        scorer = ConfidenceScorer()
        sources = ["Nhồi máu cơ tim gây đau ngực dữ dội và khó thở."]
        reasoning = [
            "Xác định triệu chứng chính",
            "Đối chiếu với nguồn tài liệu",
            "Tổng hợp câu trả lời",
        ]

        grounded = scorer.score(
            "Nhồi máu cơ tim gây đau ngực dữ dội và khó thở.",
            sources,
            reasoning,
        )
        ungrounded = scorer.score("Không rõ.", sources=[], reasoning_steps=[])

        assert grounded.score > ungrounded.score
        assert 0.0 <= grounded.score <= 1.0
