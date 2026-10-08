"""Medical Search Tool - Knowledge Base Retrieval (RAG).

This tool performs semantic search over the medical knowledge base
(ChromaDB embeddings of textbooks and guidelines) to retrieve relevant
passages for grounding agent responses (RAG).

It exposes:
    - :func:`search_medical_knowledge`: the ADK-facing search tool.
    - :func:`retrieve`: a reusable retrieval helper returning structured hits,
      used by the drug and anatomy tools.
    - :func:`format_citations`: Vietnamese citation formatting.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, List, Optional

from .document_ingestion.embedder import Embedder
from .document_ingestion.indexer import VectorIndexer

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_embedder() -> Embedder:
    """Return a process-wide cached query Embedder."""
    return Embedder()


@lru_cache(maxsize=1)
def _get_indexer() -> VectorIndexer:
    """Return a process-wide cached VectorIndexer."""
    return VectorIndexer()


def retrieve(
    query: str,
    top_k: int = 5,
    where: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Retrieve the most relevant chunks for a query.

    Args:
        query: The natural-language search query (Vietnamese or English).
        top_k: Maximum number of results to return.
        where: Optional ChromaDB metadata filter.

    Returns:
        A list of hit dicts with keys ``id``, ``text``, ``metadata`` and
        ``distance``. Empty if the knowledge base has no matching content.
    """
    query = (query or "").strip()
    if not query:
        return []

    try:
        indexer = _get_indexer()
        if indexer.is_empty():
            logger.info("Knowledge base is empty; no results for query.")
            return []
        query_embedding = _get_embedder().embed_query(query)
        return indexer.query(query_embedding, top_k=top_k, where=where)
    except Exception as exc:  # pragma: no cover - runtime/dependency issues
        logger.exception("Retrieval failed: %s", exc)
        return []


def format_citations(hits: List[Dict[str, Any]]) -> str:
    """Format retrieval hits into cited Vietnamese passages.

    Citation format:
        ``Theo [Tài liệu], Chương [X], Trang [Y]: '[trích dẫn]'``

    Args:
        hits: Retrieval hits from :func:`retrieve`.

    Returns:
        A formatted, human-readable string of cited passages.
    """
    if not hits:
        return ""

    lines: List[str] = []
    for i, hit in enumerate(hits, start=1):
        meta = hit.get("metadata") or {}
        source = meta.get("source_file") or meta.get("document_id") or "Tài liệu không rõ"
        chapter = meta.get("chapter") or meta.get("section_title") or "N/A"
        page = meta.get("page_number")
        page_str = str(page) if page not in (None, "") else "N/A"

        excerpt = (hit.get("text") or "").strip().replace("\n", " ")
        if len(excerpt) > 400:
            excerpt = excerpt[:400].rstrip() + "..."

        lines.append(
            f"{i}. Theo {source}, Chương {chapter}, Trang {page_str}: \"{excerpt}\""
        )

    return "\n\n".join(lines)


def search_medical_knowledge(
    query: str,
    specialty: str = "general",
    top_k: int = 5,
) -> str:
    """Search the medical knowledge base.

    Args:
        query: Search query in Vietnamese or English.
        specialty: Medical specialty filter. Use ``"general"`` for no filter.
        top_k: Number of results to return.

    Returns:
        Formatted string with relevant passages and citations. If the
        knowledge base is empty or nothing matches, a helpful Vietnamese
        message is returned instead.
    """
    query = (query or "").strip()
    if not query:
        return "Vui lòng cung cấp câu hỏi hoặc từ khóa tìm kiếm."

    where: Optional[Dict[str, Any]] = None
    if specialty and specialty.strip().lower() not in ("general", "all", ""):
        where = {"specialty": specialty.strip().lower()}

    hits = retrieve(query, top_k=top_k, where=where)

    # Fallback: retry without the specialty filter if it produced nothing.
    if not hits and where is not None:
        hits = retrieve(query, top_k=top_k)

    if not hits:
        return (
            "Không tìm thấy thông tin liên quan trong cơ sở tri thức. "
            "Có thể chưa có tài liệu nào được nạp, hoặc câu hỏi nằm ngoài "
            "phạm vi tài liệu hiện có."
        )

    citations = format_citations(hits)
    return (
        f"Tìm thấy {len(hits)} đoạn tài liệu liên quan đến truy vấn:\n\n{citations}"
    )

