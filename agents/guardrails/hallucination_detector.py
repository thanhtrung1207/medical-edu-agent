"""Hallucination detection for medical agent responses.

Uses lightweight lexical-overlap heuristics (no additional LLM call) to flag
claims in a response that are not supported by the retrieved sources. This is
an MVP approach optimized for low latency in an educational context.
"""

from __future__ import annotations

import logging

from ._text import split_sentences, tokenize
from .models import HallucinationReport

logger = logging.getLogger(__name__)

# Minimum fraction of a claim's meaningful tokens that must appear in a source
# for the claim to be considered "supported".
_SUPPORT_TOKEN_THRESHOLD = 0.5

# Claims shorter than this many meaningful tokens are treated as trivial
# (greetings, transitions, disclaimers) and are not risk-scored.
_MIN_CLAIM_TOKENS = 3

# Sources with fewer meaningful tokens than this are too short to be real
# grounding material (e.g. just a book title or short reference string) and are
# discarded before computing overlap.
_MIN_SOURCE_TOKENS = 8

# Common stop-word-like tokens (Vietnamese + English) that carry little
# grounding signal and are ignored when computing overlap.
_STOPWORDS: frozenset[str] = frozenset(
    {
        "la", "va", "cua", "co", "khong", "cho", "trong", "mot", "cac", "nay",
        "do", "de", "duoc", "voi", "hay", "hoac", "thi", "ma", "nhu", "nhung",
        "ban", "ve", "tren", "duoi", "khi", "neu", "boi", "vi", "nen", "cung",
        "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "for",
        "with", "that", "this", "it", "be", "as", "on", "by", "at", "from",
    }
)


class HallucinationDetector:
    """Detects potential hallucinations in agent responses."""

    def __init__(
        self,
        support_threshold: float = _SUPPORT_TOKEN_THRESHOLD,
        min_claim_tokens: int = _MIN_CLAIM_TOKENS,
    ) -> None:
        """Initialize the detector.

        Args:
            support_threshold: Minimum fraction of a claim's meaningful tokens
                that must be present in a single source for it to count as
                supported.
            min_claim_tokens: Minimum meaningful-token count for a claim to be
                risk-scored.
        """
        self.support_threshold = support_threshold
        self.min_claim_tokens = min_claim_tokens

    def detect(self, response: str, sources: list[str]) -> HallucinationReport:
        """Check whether the response contains statements unbacked by sources.

        Strategy:
            1. Split response into individual claims/statements.
            2. For each claim, check if it is supported by any source via
               token-overlap.
            3. Flag unsupported claims.
            4. Calculate an overall hallucination risk score.

        Args:
            response: The agent's generated response text.
            sources: List of source text snippets used to ground the response.

        Returns:
            A :class:`HallucinationReport` with flagged/supported statements
            and an overall risk score.
        """
        claims = split_sentences(response)
        source_token_sets = [self._meaningful_tokens(src) for src in sources]
        # Filter out sources that are too short to be real grounding material
        # (e.g. just book titles like "Harrison's Principles of Internal
        # Medicine"). Only keep sources with enough tokens to represent actual
        # content excerpts.
        source_token_sets = [
            s for s in source_token_sets
            if len(s) >= _MIN_SOURCE_TOKENS
        ]

        flagged: list[str] = []
        supported: list[str] = []
        scored_claims = 0

        for claim in claims:
            claim_tokens = self._meaningful_tokens(claim)
            if len(claim_tokens) < self.min_claim_tokens:
                # Trivial/transitional claim: skip from risk scoring.
                continue

            scored_claims += 1
            if self._is_supported(claim_tokens, source_token_sets):
                supported.append(claim)
            else:
                flagged.append(claim)

        risk_score = self._risk_score(
            flagged_count=len(flagged),
            scored_claims=scored_claims,
            has_sources=bool(source_token_sets),
        )

        report = HallucinationReport(
            risk_score=round(risk_score, 3),
            flagged_statements=flagged,
            supported_statements=supported,
            total_claims=scored_claims,
        )

        if flagged:
            logger.info(
                "Hallucination check: %d/%d claims unsupported (risk=%.2f)",
                len(flagged),
                scored_claims,
                report.risk_score,
            )
        return report

    def _meaningful_tokens(self, text: str) -> set[str]:
        """Return content tokens for ``text`` with stop-words removed."""
        return {tok for tok in tokenize(text) if tok not in _STOPWORDS}

    def _is_supported(
        self, claim_tokens: set[str], source_token_sets: list[set[str]]
    ) -> bool:
        """Return whether a claim is supported by any source token set."""
        if not claim_tokens or not source_token_sets:
            return False
        for source_tokens in source_token_sets:
            overlap = len(claim_tokens & source_tokens)
            if overlap / len(claim_tokens) >= self.support_threshold:
                return True
        return False

    def _risk_score(
        self, flagged_count: int, scored_claims: int, has_sources: bool
    ) -> float:
        """Compute the overall hallucination risk score in [0.0, 1.0]."""
        if scored_claims == 0:
            # No substantive claims to verify -> negligible risk.
            return 0.0
        if not has_sources:
            # No sources available (knowledge base empty). The agent relies on
            # its model's inherent training knowledge (e.g., Gemini). In this
            # case we assign a moderate baseline risk rather than blocking
            # entirely, since the model's medical knowledge is generally
            # reliable for educational purposes.
            return 0.3
        return flagged_count / scored_claims
