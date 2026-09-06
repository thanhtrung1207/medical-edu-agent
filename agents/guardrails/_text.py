"""Text normalization utilities for guardrail keyword matching.

These helpers make all text matching case-insensitive and diacritic-insensitive
so that Vietnamese input (e.g. "tự tử", "chẩn đoán") can be matched reliably
regardless of accents or letter casing. The utilities are intentionally
lightweight (pure stdlib) to keep guardrail latency minimal.
"""

from __future__ import annotations

import re
import unicodedata

# Vietnamese "đ"/"Đ" are not decomposed by NFD, so handle them explicitly.
_D_STROKE_MAP = str.maketrans({"đ": "d", "Đ": "d"})

_WHITESPACE_RE = re.compile(r"\s+")

# Sentence/claim splitting: break on sentence terminators and newlines while
# keeping the logic simple and fast (no NLP dependency).
_SENTENCE_SPLIT_RE = re.compile(r"[.!?;\n]+|(?:\s-\s)")


def strip_diacritics(text: str) -> str:
    """Remove diacritical marks from text (including Vietnamese ``đ``).

    Args:
        text: Arbitrary input text.

    Returns:
        The text with combining accent marks stripped. Casing is preserved.
    """
    if not text:
        return ""
    # Normalize compatibility + decompose accents, then drop combining marks.
    decomposed = unicodedata.normalize("NFD", text.translate(_D_STROKE_MAP))
    without_marks = "".join(
        ch for ch in decomposed if unicodedata.category(ch) != "Mn"
    )
    return unicodedata.normalize("NFC", without_marks)


def normalize(text: str) -> str:
    """Return a lowercase, diacritic-free, whitespace-collapsed version of text.

    This is the canonical form used for all keyword/substring matching in the
    guardrails module.

    Args:
        text: Arbitrary input text.

    Returns:
        Normalized text suitable for case/accent-insensitive matching.
    """
    if not text:
        return ""
    lowered = strip_diacritics(text).lower()
    return _WHITESPACE_RE.sub(" ", lowered).strip()


def contains_keyword(text: str, keyword: str) -> bool:
    """Check whether ``keyword`` appears in ``text`` (accent/case-insensitive).

    Args:
        text: Text to search within.
        keyword: Keyword or phrase to look for.

    Returns:
        ``True`` if the normalized keyword is a substring of the normalized text.
    """
    norm_keyword = normalize(keyword)
    if not norm_keyword:
        return False
    return norm_keyword in normalize(text)


def find_keywords(text: str, keywords: list[str]) -> list[str]:
    """Return the subset of ``keywords`` found in ``text``.

    Args:
        text: Text to search within.
        keywords: Candidate keywords/phrases.

    Returns:
        List of the original keywords (as provided) that were matched.
    """
    norm_text = normalize(text)
    matched: list[str] = []
    for keyword in keywords:
        norm_keyword = normalize(keyword)
        if norm_keyword and norm_keyword in norm_text:
            matched.append(keyword)
    return matched


def split_sentences(text: str) -> list[str]:
    """Split text into individual sentences/claims.

    Splitting is heuristic and dependency-free: it breaks on common sentence
    terminators (``. ! ? ;``), newlines, and bullet-style separators.

    Args:
        text: The text to split.

    Returns:
        A list of non-empty, stripped sentence fragments.
    """
    if not text:
        return []
    parts = _SENTENCE_SPLIT_RE.split(text)
    return [part.strip() for part in parts if part and part.strip()]


def tokenize(text: str) -> set[str]:
    """Tokenize text into a set of normalized word tokens.

    Args:
        text: The text to tokenize.

    Returns:
        A set of lowercase, diacritic-free word tokens (length >= 1).
    """
    norm = normalize(text)
    if not norm:
        return set()
    return {tok for tok in re.split(r"[^a-z0-9]+", norm) if tok}
