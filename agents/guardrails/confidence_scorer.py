"""Confidence scoring for medical agent responses.

Computes a 0.0 - 1.0 confidence score composed of three weighted components:
source coverage (max 0.4), reasoning quality (max 0.3), and consistency with
known medical facts (max 0.3). Purely heuristic and dependency-free.
"""

from __future__ import annotations

import logging

from ._text import normalize, tokenize
from .models import ConfidenceReport

logger = logging.getLogger(__name__)

# Component weight ceilings.
_MAX_SOURCE_COVERAGE = 0.4
_MAX_REASONING_QUALITY = 0.3
_MAX_CONSISTENCY = 0.3

# Stop-word-like tokens ignored when measuring source coverage overlap.
_STOPWORDS: frozenset[str] = frozenset(
    {
        "la", "va", "cua", "co", "khong", "cho", "trong", "mot", "cac", "nay",
        "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "for",
        "with", "that", "this", "it", "be", "as", "on", "by", "at", "from",
    }
)

# Phrases that indicate hedging / low certainty in the response.
_UNCERTAINTY_MARKERS = [
    "có thể", "có lẽ", "không chắc", "tôi nghĩ", "dường như", "không rõ",
    "maybe", "perhaps", "i think", "not sure", "possibly", "might be",
]

# Phrases that contradict evidence-based medical framing.
_INCONSISTENCY_MARKERS = [
    "chữa khỏi hoàn toàn 100%", "luôn luôn khỏi", "không bao giờ có tác dụng phụ",
    "chắc chắn khỏi", "thần dược", "miracle cure", "always works",
    "never has side effects", "guaranteed cure",
]


class ConfidenceScorer:
    """Scores the confidence level of agent responses."""

    def score(
        self,
        response: str,
        sources: list[str],
        reasoning_steps: list[str],
    ) -> ConfidenceReport:
        """Calculate a confidence score for a response.

        Confidence is based on:
            1. Source coverage: how much of the answer is backed by sources
               (0 - 0.4).
            2. Reasoning quality: whether reasoning steps are present and
               complete (0 - 0.3).
            3. Consistency: whether the answer aligns with known medical facts
               and avoids overclaiming (0 - 0.3).

        Args:
            response: The agent's generated response text.
            sources: Source snippets used to ground the response.
            reasoning_steps: The reasoning/chain-of-thought steps taken.

        Returns:
            A :class:`ConfidenceReport` with the total score, per-component
            breakdown, and recommendations.
        """
        source_coverage = self._source_coverage(response, sources)
        reasoning_quality = self._reasoning_quality(reasoning_steps)
        consistency = self._consistency(response)

        total = round(source_coverage + reasoning_quality + consistency, 3)
        recommendations = self._recommendations(
            source_coverage, reasoning_quality, consistency, sources
        )

        report = ConfidenceReport(
            score=total,
            source_coverage=round(source_coverage, 3),
            reasoning_quality=round(reasoning_quality, 3),
            consistency_score=round(consistency, 3),
            recommendations=recommendations,
        )
        logger.info("Confidence score computed: %.2f", total)
        return report

    def _content_tokens(self, text: str) -> set[str]:
        """Return content tokens with stop-words removed."""
        return {tok for tok in tokenize(text) if tok not in _STOPWORDS}

    def _source_coverage(self, response: str, sources: list[str]) -> float:
        """Score how well the response tokens are covered by the sources."""
        response_tokens = self._content_tokens(response)
        if not response_tokens:
            return 0.0
        if not sources:
            return 0.0
        source_tokens: set[str] = set()
        for src in sources:
            source_tokens |= self._content_tokens(src)
        if not source_tokens:
            return 0.0
        covered = len(response_tokens & source_tokens) / len(response_tokens)
        return covered * _MAX_SOURCE_COVERAGE

    def _reasoning_quality(self, reasoning_steps: list[str]) -> float:
        """Score reasoning completeness based on step count and substance."""
        substantive = [
            step for step in reasoning_steps if len(tokenize(step)) >= 3
        ]
        if not substantive:
            return 0.0
        # Reward more (substantive) reasoning steps, saturating at 3+ steps.
        step_ratio = min(1.0, len(substantive) / 3)
        return step_ratio * _MAX_REASONING_QUALITY

    def _consistency(self, response: str) -> float:
        """Score alignment with evidence-based medical framing."""
        norm = normalize(response)
        score = _MAX_CONSISTENCY

        # Overclaiming / non-evidence-based statements sharply reduce score.
        for marker in _INCONSISTENCY_MARKERS:
            if normalize(marker) in norm:
                score -= 0.15

        # Excessive hedging modestly reduces confidence.
        hedges = sum(
            1 for m in _UNCERTAINTY_MARKERS if normalize(m) in norm
        )
        if hedges >= 2:
            score -= 0.1

        return max(0.0, score)

    def _recommendations(
        self,
        source_coverage: float,
        reasoning_quality: float,
        consistency: float,
        sources: list[str],
    ) -> list[str]:
        """Produce actionable recommendations based on component scores."""
        recs: list[str] = []
        if not sources:
            recs.append(
                "Không có nguồn tham chiếu: nên truy xuất tài liệu y khoa để "
                "củng cố câu trả lời."
            )
        elif source_coverage < _MAX_SOURCE_COVERAGE * 0.5:
            recs.append(
                "Độ bao phủ nguồn thấp: nhiều nội dung chưa được nguồn hỗ trợ."
            )
        if reasoning_quality < _MAX_REASONING_QUALITY * 0.5:
            recs.append(
                "Lập luận chưa đầy đủ: nên bổ sung các bước suy luận rõ ràng."
            )
        if consistency < _MAX_CONSISTENCY:
            recs.append(
                "Phát hiện phát ngôn quá chắc chắn hoặc thiếu bằng chứng: nên "
                "diễn đạt thận trọng theo y học bằng chứng."
            )
        if not recs:
            recs.append("Câu trả lời có độ tin cậy tốt.")
        return recs
