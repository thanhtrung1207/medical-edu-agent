"""Ingestion Pipeline Orchestrator.

Coordinates the full RAG ingestion flow for a document:

    preprocess -> chunk -> embed -> index

Tracks per-document status, supports partial ingestion (a failure while
indexing one batch does not abort the whole document) and returns a detailed
:class:`IngestionReport`.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from .chunker import DEFAULT_MAX_CHARS, DEFAULT_OVERLAP_RATIO, chunk_text_blocks
from .embedder import DEFAULT_BATCH_SIZE, Embedder
from .indexer import VectorIndexer
from .preprocessor import preprocess_document

logger = logging.getLogger(__name__)

# Difficulty tiers recognised from the knowledge directory layout, e.g.
# ``data/knowledge/Foundation/prosthodontics_basics.md`` -> ``foundation``.
DIFFICULTY_TIERS = {"foundation", "intermediate", "advanced"}


class IngestionStatus(str, Enum):
    """Lifecycle status of a document ingestion job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    # Some chunks indexed, but errors occurred.
    PARTIAL = "partial"


@dataclass
class IngestionReport:
    """Result of an ingestion job.

    Attributes:
        document_id: Stable identifier for the ingested document.
        source_file: Base name of the source file.
        status: Final :class:`IngestionStatus`.
        num_pages: Number of pages/blocks extracted.
        num_chunks: Total chunks produced.
        num_indexed: Chunks successfully indexed.
        processing_time: Wall-clock processing time in seconds.
        errors: List of error messages encountered.
    """

    document_id: str
    source_file: str
    status: IngestionStatus = IngestionStatus.PENDING
    num_pages: int = 0
    num_chunks: int = 0
    num_indexed: int = 0
    processing_time: float = 0.0
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Return a JSON-serializable representation of the report."""
        return {
            "document_id": self.document_id,
            "source_file": self.source_file,
            "status": self.status.value,
            "num_pages": self.num_pages,
            "num_chunks": self.num_chunks,
            "num_indexed": self.num_indexed,
            "processing_time": round(self.processing_time, 3),
            "errors": self.errors,
        }


class IngestionPipeline:
    """Orchestrates preprocessing, chunking, embedding and indexing.

    Args:
        indexer: Optional pre-configured :class:`VectorIndexer`.
        embedder: Optional pre-configured :class:`Embedder`.
        max_chars: Maximum characters per chunk.
        overlap_ratio: Overlap ratio between chunks.
        embed_batch_size: Batch size used both for embedding and indexing.
    """

    def __init__(
        self,
        indexer: Optional[VectorIndexer] = None,
        embedder: Optional[Embedder] = None,
        max_chars: int = DEFAULT_MAX_CHARS,
        overlap_ratio: float = DEFAULT_OVERLAP_RATIO,
        embed_batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> None:
        self.indexer = indexer or VectorIndexer()
        self.embedder = embedder or Embedder(batch_size=embed_batch_size)
        self.max_chars = max_chars
        self.overlap_ratio = overlap_ratio
        self.batch_size = max(1, embed_batch_size)
        # In-memory status tracking keyed by document_id.
        self._status: Dict[str, IngestionStatus] = {}

    def get_status(self, document_id: str) -> IngestionStatus:
        """Return the tracked status for a document."""
        return self._status.get(document_id, IngestionStatus.PENDING)

    @staticmethod
    def _make_document_id(file_path: str, override: Optional[str]) -> str:
        """Derive a stable document_id from the file name (or use override)."""
        if override:
            return override
        base = os.path.splitext(os.path.basename(file_path))[0]
        slug = "".join(c if c.isalnum() else "_" for c in base).strip("_").lower()
        short = uuid.uuid4().hex[:8]
        return f"{slug or 'doc'}_{short}"

    @staticmethod
    def _detect_difficulty(file_path: str) -> Optional[str]:
        """Infer the difficulty tier from the file's parent directory name.

        Files organised under ``Foundation/``, ``Intermediate/`` or
        ``Advanced/`` are tagged with the corresponding difficulty so the
        metadata is available for filtered retrieval in ChromaDB. Returns
        ``None`` when the parent directory is not a known tier.
        """
        parent = os.path.basename(os.path.dirname(os.path.abspath(file_path)))
        parent_lower = parent.lower()
        return parent_lower if parent_lower in DIFFICULTY_TIERS else None

    def ingest(
        self,
        file_path: str,
        document_id: Optional[str] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> IngestionReport:
        """Ingest a single document into the knowledge base.

        Args:
            file_path: Path to the source document.
            document_id: Optional stable document identifier. If omitted, one
                is generated from the file name.
            extra_metadata: Optional metadata merged into every chunk (e.g.
                ``{"specialty": "cardiology"}``).

        Returns:
            An :class:`IngestionReport` summarizing the outcome.
        """
        start = time.time()
        source_file = os.path.basename(file_path)
        doc_id = self._make_document_id(file_path, document_id)
        difficulty = self._detect_difficulty(file_path)
        report = IngestionReport(document_id=doc_id, source_file=source_file)
        self._status[doc_id] = IngestionStatus.PROCESSING

        # -- 1. Preprocess -------------------------------------------------
        try:
            blocks = preprocess_document(file_path)
        except Exception as exc:
            logger.exception("Preprocessing failed for '%s'", file_path)
            report.status = IngestionStatus.FAILED
            report.errors.append(f"preprocess: {exc}")
            report.processing_time = time.time() - start
            self._status[doc_id] = IngestionStatus.FAILED
            return report

        report.num_pages = len(blocks)
        if not blocks:
            report.status = IngestionStatus.FAILED
            report.errors.append("preprocess: no extractable text found")
            report.processing_time = time.time() - start
            self._status[doc_id] = IngestionStatus.FAILED
            return report

        # -- 2. Chunk ------------------------------------------------------
        chunks = chunk_text_blocks(
            blocks, max_chars=self.max_chars, overlap_ratio=self.overlap_ratio
        )
        report.num_chunks = len(chunks)
        if not chunks:
            report.status = IngestionStatus.FAILED
            report.errors.append("chunk: no chunks produced")
            report.processing_time = time.time() - start
            self._status[doc_id] = IngestionStatus.FAILED
            return report

        # -- 3 & 4. Embed + Index (batched, partial-tolerant) --------------
        indexed = 0
        for batch_start in range(0, len(chunks), self.batch_size):
            batch = chunks[batch_start:batch_start + self.batch_size]
            texts = [c.text for c in batch]
            try:
                embeddings = self.embedder.embed(texts)
                ids = [f"{doc_id}__chunk_{c.metadata.get('chunk_index', i)}"
                       for i, c in enumerate(batch, start=batch_start)]
                metadatas = []
                for chunk in batch:
                    meta = dict(chunk.metadata)
                    meta["document_id"] = doc_id
                    # Tag the difficulty tier (foundation/intermediate/advanced)
                    # inferred from the directory layout when available.
                    if difficulty:
                        meta["difficulty"] = difficulty
                    if extra_metadata:
                        meta.update(extra_metadata)
                    metadatas.append(meta)

                indexed += self.indexer.add(
                    ids=ids,
                    embeddings=embeddings,
                    documents=texts,
                    metadatas=metadatas,
                )
            except Exception as exc:
                logger.exception(
                    "Failed to embed/index batch starting at %d for '%s'",
                    batch_start,
                    source_file,
                )
                report.errors.append(f"batch@{batch_start}: {exc}")

        report.num_indexed = indexed
        report.processing_time = time.time() - start

        if indexed == 0:
            report.status = IngestionStatus.FAILED
        elif report.errors:
            report.status = IngestionStatus.PARTIAL
        else:
            report.status = IngestionStatus.COMPLETED

        self._status[doc_id] = report.status
        logger.info(
            "Ingestion of '%s' finished: status=%s, indexed=%d/%d, time=%.2fs",
            source_file,
            report.status.value,
            report.num_indexed,
            report.num_chunks,
            report.processing_time,
        )
        return report

    def ingest_directory(
        self,
        directory: str,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[IngestionReport]:
        """Ingest all supported documents found in a directory (recursively).

        The scan is recursive (equivalent to a ``data/knowledge/**/*.md`` glob),
        so tiered sub-directories such as ``Foundation/``, ``Intermediate/`` and
        ``Advanced/`` are traversed. Each file is tagged with a ``difficulty``
        metadata value inferred from its parent tier directory (see
        :meth:`_detect_difficulty`).

        Args:
            directory: The root directory to scan.
            extra_metadata: Optional metadata merged into every chunk.

        Returns:
            A list of :class:`IngestionReport`, one per processed file.
        """
        from .preprocessor import SUPPORTED_EXTENSIONS

        reports: List[IngestionReport] = []
        if not os.path.isdir(directory):
            logger.warning("Directory not found: %s", directory)
            return reports

        for root, _dirs, files in os.walk(directory):
            for name in sorted(files):
                ext = os.path.splitext(name)[1].lower()
                if ext in SUPPORTED_EXTENSIONS:
                    path = os.path.join(root, name)
                    reports.append(self.ingest(path, extra_metadata=extra_metadata))
        return reports

    def delete_document(self, document_id: str) -> None:
        """Remove a previously ingested document from the knowledge base."""
        self.indexer.delete_by_document_id(document_id)
        self._status.pop(document_id, None)
