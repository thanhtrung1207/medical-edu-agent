"""Smart Text Chunker.

Splits :class:`~tools.document_ingestion.preprocessor.TextBlock` objects into
retrieval-friendly chunks while preserving structure and metadata.

Strategy:
    1. Chunk by section/heading first (each TextBlock is treated as a section).
    2. If a section is larger than the maximum chunk size, split at paragraph
       boundaries (and, as a last resort, sentence boundaries).
    3. Apply a configurable character overlap (10-15%) between consecutive
       chunks for context continuity.
    4. Approximate a 512-token limit with ~2000 characters.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List

from .preprocessor import TextBlock

logger = logging.getLogger(__name__)

# ~512 tokens approximated as ~2000 characters.
DEFAULT_MAX_CHARS = 2000
# 12% overlap sits in the requested 10-15% range.
DEFAULT_OVERLAP_RATIO = 0.12

_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。！？])\s+")


@dataclass
class Chunk:
    """A retrieval unit produced by the chunker.

    Attributes:
        text: The chunk text content.
        metadata: Per-chunk metadata including ``source_file``,
            ``page_number``, ``section_title``, ``chapter`` and ``chunk_index``.
    """

    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)


def _split_oversized(text: str, max_chars: int) -> List[str]:
    """Split a large text into pieces no larger than ``max_chars``.

    Splits at paragraph boundaries first, then sentence boundaries, then a
    hard character cut as a last resort.
    """
    if len(text) <= max_chars:
        return [text]

    pieces: List[str] = []
    buffer = ""

    for paragraph in _PARAGRAPH_SPLIT.split(text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue

        candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
        if len(candidate) <= max_chars:
            buffer = candidate
            continue

        if buffer:
            pieces.append(buffer)
            buffer = ""

        if len(paragraph) <= max_chars:
            buffer = paragraph
            continue

        # Paragraph itself too large -> split by sentences.
        sentence_buffer = ""
        for sentence in _SENTENCE_SPLIT.split(paragraph):
            sentence = sentence.strip()
            if not sentence:
                continue
            sent_candidate = f"{sentence_buffer} {sentence}".strip()
            if len(sent_candidate) <= max_chars:
                sentence_buffer = sent_candidate
            else:
                if sentence_buffer:
                    pieces.append(sentence_buffer)
                # Sentence still too large -> hard character cut.
                while len(sentence) > max_chars:
                    pieces.append(sentence[:max_chars])
                    sentence = sentence[max_chars:]
                sentence_buffer = sentence
        if sentence_buffer:
            buffer = sentence_buffer

    if buffer:
        pieces.append(buffer)

    return [p for p in pieces if p.strip()]


def _apply_overlap(pieces: List[str], overlap_chars: int) -> List[str]:
    """Prepend a trailing slice of the previous piece to each subsequent piece."""
    if overlap_chars <= 0 or len(pieces) <= 1:
        return pieces

    overlapped: List[str] = [pieces[0]]
    for i in range(1, len(pieces)):
        prev = pieces[i - 1]
        tail = prev[-overlap_chars:]
        # Start overlap at a word boundary for readability.
        space_idx = tail.find(" ")
        if 0 < space_idx < len(tail) - 1:
            tail = tail[space_idx + 1:]
        overlapped.append(f"{tail} {pieces[i]}".strip())
    return overlapped


def chunk_text_blocks(
    blocks: List[TextBlock],
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_ratio: float = DEFAULT_OVERLAP_RATIO,
) -> List[Chunk]:
    """Chunk a list of :class:`TextBlock` objects into retrieval units.

    Args:
        blocks: Preprocessed text blocks (typically one per page/section).
        max_chars: Maximum characters per chunk (~512 tokens by default).
        overlap_ratio: Fractional overlap between consecutive chunks (0.10-0.15
            recommended).

    Returns:
        A list of :class:`Chunk` objects with populated per-chunk metadata.
    """
    if not blocks:
        return []

    overlap_ratio = max(0.0, min(overlap_ratio, 0.5))
    overlap_chars = int(max_chars * overlap_ratio)

    chunks: List[Chunk] = []
    chunk_index = 0

    for block in blocks:
        content = (block.content or "").strip()
        if not content:
            continue

        meta = block.metadata or {}
        pieces = _split_oversized(content, max_chars)
        pieces = _apply_overlap(pieces, overlap_chars)

        for piece in pieces:
            piece = piece.strip()
            if not piece:
                continue
            chunks.append(
                Chunk(
                    text=piece,
                    metadata={
                        "source_file": meta.get("source_file"),
                        "page_number": meta.get("page"),
                        "section_title": meta.get("section"),
                        "chapter": meta.get("chapter"),
                        "chunk_index": chunk_index,
                    },
                )
            )
            chunk_index += 1

    logger.info(
        "Chunked %d block(s) into %d chunk(s) (max_chars=%d, overlap=%d)",
        len(blocks),
        len(chunks),
        max_chars,
        overlap_chars,
    )
    return chunks
