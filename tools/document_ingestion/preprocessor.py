"""Document Preprocessor - Text Extraction & Cleaning.

Extracts text content from multiple document formats (PDF, DOCX, TXT,
Markdown, PPTX), cleans the extracted text (whitespace normalization and
encoding fixes) and preserves structural metadata (page numbers, section
headings, source file) as a list of :class:`TextBlock` objects.

Heavy third-party parsers (PyPDF2, python-docx, python-pptx) are imported
lazily so that importing this module never fails when an optional dependency
is missing. A clear error is raised only when the corresponding format is
actually requested.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Supported file extensions (lower-case, including leading dot).
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown", ".pptx"}

# Heading detection patterns (Vietnamese + English medical textbook style).
_HEADING_PATTERNS = [
    re.compile(r"^\s*(chương|chapter)\s+([0-9IVXLCDM]+)\b.*", re.IGNORECASE),
    re.compile(r"^\s*(phần|part|bài|section)\s+([0-9IVXLCDM]+)\b.*", re.IGNORECASE),
    re.compile(r"^\s*(#{1,6})\s+.+"),  # Markdown ATX headings
    re.compile(r"^\s*\d+(\.\d+)*\.?\s+[A-ZĐÀÁÂÃ].{0,80}$"),  # numbered headings
]

_CHAPTER_PATTERN = re.compile(
    r"\b(chương|chapter)\s+([0-9IVXLCDM]+)\b", re.IGNORECASE
)


@dataclass
class TextBlock:
    """A unit of extracted text together with its structural metadata.

    Attributes:
        content: The cleaned text content of the block.
        metadata: Structural metadata. Common keys are ``page``,
            ``section``, ``chapter`` and ``source_file``.
    """

    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.metadata.setdefault("page", None)
        self.metadata.setdefault("section", None)
        self.metadata.setdefault("chapter", None)
        self.metadata.setdefault("source_file", None)


def clean_text(text: str) -> str:
    """Clean raw extracted text.

    Fixes common encoding issues, normalizes unicode (NFC), removes control
    characters and collapses excessive whitespace while keeping paragraph
    breaks intact.

    Args:
        text: Raw text extracted from a document.

    Returns:
        The cleaned text.
    """
    if not text:
        return ""

    # Normalize unicode (important for Vietnamese diacritics).
    text = unicodedata.normalize("NFC", text)

    # Common mojibake / ligature fixes.
    replacements = {
        "\u00a0": " ",  # non-breaking space
        "\ufeff": "",  # BOM
        "\ufb01": "fi",
        "\ufb02": "fl",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)

    # Remove non-printable control characters (keep newlines/tabs).
    text = "".join(
        ch for ch in text if ch in ("\n", "\t") or not unicodedata.category(ch).startswith("C")
    )

    # Normalize line endings.
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Collapse runs of spaces/tabs.
    text = re.sub(r"[ \t]+", " ", text)

    # Collapse 3+ blank lines into a single blank line (preserve paragraphs).
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)

    # Trim trailing spaces on each line.
    text = "\n".join(line.rstrip() for line in text.split("\n"))

    return text.strip()


def _detect_heading(line: str) -> bool:
    """Return True if a line looks like a structural heading."""
    stripped = line.strip()
    if not stripped or len(stripped) > 120:
        return False
    return any(pattern.match(stripped) for pattern in _HEADING_PATTERNS)


def _detect_chapter(text: str) -> Optional[str]:
    """Extract a chapter label from a text region, if present."""
    match = _CHAPTER_PATTERN.search(text)
    if match:
        return f"{match.group(1).title()} {match.group(2)}"
    return None


def _extract_pdf(file_path: str) -> List[TextBlock]:
    """Extract text from a PDF file, one TextBlock per page."""
    try:
        from PyPDF2 import PdfReader  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "PyPDF2 is required to process PDF files. Install with 'pip install PyPDF2'."
        ) from exc

    source_file = os.path.basename(file_path)
    blocks: List[TextBlock] = []
    current_chapter: Optional[str] = None

    reader = PdfReader(file_path)
    for page_index, page in enumerate(reader.pages, start=1):
        raw = page.extract_text() or ""
        cleaned = clean_text(raw)
        if not cleaned:
            continue

        chapter = _detect_chapter(cleaned)
        if chapter:
            current_chapter = chapter

        section = None
        for line in cleaned.split("\n"):
            if _detect_heading(line):
                section = line.strip().lstrip("#").strip()
                break

        blocks.append(
            TextBlock(
                content=cleaned,
                metadata={
                    "page": page_index,
                    "section": section,
                    "chapter": current_chapter,
                    "source_file": source_file,
                },
            )
        )

    logger.info("Extracted %d page block(s) from PDF '%s'", len(blocks), source_file)
    return blocks


def _extract_docx(file_path: str) -> List[TextBlock]:
    """Extract text from a DOCX file, grouping paragraphs under headings."""
    try:
        import docx  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "python-docx is required to process DOCX files. "
            "Install with 'pip install python-docx'."
        ) from exc

    source_file = os.path.basename(file_path)
    document = docx.Document(file_path)

    blocks: List[TextBlock] = []
    current_section: Optional[str] = None
    current_chapter: Optional[str] = None
    buffer: List[str] = []

    def flush() -> None:
        if not buffer:
            return
        cleaned = clean_text("\n".join(buffer))
        if cleaned:
            blocks.append(
                TextBlock(
                    content=cleaned,
                    metadata={
                        "page": None,
                        "section": current_section,
                        "chapter": current_chapter,
                        "source_file": source_file,
                    },
                )
            )
        buffer.clear()

    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style_name = (para.style.name or "").lower() if para.style else ""
        is_heading = style_name.startswith("heading") or style_name == "title"

        if is_heading or _detect_heading(text):
            flush()
            current_section = text
            chapter = _detect_chapter(text)
            if chapter:
                current_chapter = chapter
        else:
            buffer.append(text)

    flush()
    logger.info("Extracted %d block(s) from DOCX '%s'", len(blocks), source_file)
    return blocks


def _extract_pptx(file_path: str) -> List[TextBlock]:
    """Extract text from a PPTX file, one TextBlock per slide."""
    try:
        from pptx import Presentation  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "python-pptx is required to process PPTX files. "
            "Install with 'pip install python-pptx'."
        ) from exc

    source_file = os.path.basename(file_path)
    presentation = Presentation(file_path)

    blocks: List[TextBlock] = []
    current_chapter: Optional[str] = None

    for slide_index, slide in enumerate(presentation.slides, start=1):
        parts: List[str] = []
        title: Optional[str] = None

        for shape in slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                continue
            shape_text = shape.text_frame.text.strip()
            if not shape_text:
                continue
            # The first non-empty title-like shape becomes the section title.
            if title is None and getattr(shape, "name", "").lower().startswith("title"):
                title = shape_text.split("\n")[0].strip()
            parts.append(shape_text)

        cleaned = clean_text("\n".join(parts))
        if not cleaned:
            continue

        if title is None:
            title = cleaned.split("\n")[0].strip()[:120]

        chapter = _detect_chapter(cleaned)
        if chapter:
            current_chapter = chapter

        blocks.append(
            TextBlock(
                content=cleaned,
                metadata={
                    "page": slide_index,
                    "section": title,
                    "chapter": current_chapter,
                    "source_file": source_file,
                },
            )
        )

    logger.info("Extracted %d slide block(s) from PPTX '%s'", len(blocks), source_file)
    return blocks


def _extract_plaintext(file_path: str, is_markdown: bool) -> List[TextBlock]:
    """Extract text from a TXT or Markdown file, split by headings."""
    source_file = os.path.basename(file_path)

    raw = ""
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            with open(file_path, "r", encoding=encoding) as handle:
                raw = handle.read()
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    cleaned = clean_text(raw)
    if not cleaned:
        return []

    blocks: List[TextBlock] = []
    current_section: Optional[str] = None
    current_chapter: Optional[str] = None
    buffer: List[str] = []

    def flush() -> None:
        if not buffer:
            return
        content = clean_text("\n".join(buffer))
        if content:
            blocks.append(
                TextBlock(
                    content=content,
                    metadata={
                        "page": None,
                        "section": current_section,
                        "chapter": current_chapter,
                        "source_file": source_file,
                    },
                )
            )
        buffer.clear()

    for line in cleaned.split("\n"):
        is_heading = (is_markdown and line.strip().startswith("#")) or _detect_heading(line)
        if is_heading:
            flush()
            current_section = line.strip().lstrip("#").strip()
            chapter = _detect_chapter(current_section)
            if chapter:
                current_chapter = chapter
        else:
            buffer.append(line)

    flush()

    # If no headings found, keep the whole document as a single block.
    if not blocks:
        blocks.append(
            TextBlock(
                content=cleaned,
                metadata={
                    "page": None,
                    "section": None,
                    "chapter": None,
                    "source_file": source_file,
                },
            )
        )

    logger.info("Extracted %d block(s) from text file '%s'", len(blocks), source_file)
    return blocks


def preprocess_document(file_path: str) -> List[TextBlock]:
    """Extract and clean text from a document.

    Dispatches to the appropriate extractor based on the file extension and
    returns a list of structured :class:`TextBlock` objects.

    Args:
        file_path: Absolute or relative path to the source document.

    Returns:
        A list of :class:`TextBlock` objects with cleaned content and
        structural metadata.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file type is not supported.
        RuntimeError: If a required optional parser is not installed.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Document not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    logger.info("Preprocessing document '%s' (type=%s)", file_path, ext)

    if ext == ".pdf":
        return _extract_pdf(file_path)
    if ext == ".docx":
        return _extract_docx(file_path)
    if ext == ".pptx":
        return _extract_pptx(file_path)
    return _extract_plaintext(file_path, is_markdown=ext in (".md", ".markdown"))
