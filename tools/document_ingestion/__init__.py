"""Document Ingestion Package.

Provides the end-to-end RAG ingestion pipeline for the Medical Education AI
Agent: preprocessing (text extraction), chunking, embedding generation and
ChromaDB indexing.

Public API:
    - :class:`TextBlock`, :func:`preprocess_document`
    - :class:`Chunk`, :func:`chunk_text_blocks`
    - :class:`Embedder`, :func:`embed_texts`
    - :class:`VectorIndexer`
    - :class:`IngestionPipeline`, :class:`IngestionReport`, :class:`IngestionStatus`
"""

from __future__ import annotations

from .chunker import Chunk, chunk_text_blocks
from .embedder import Embedder, embed_texts
from .indexer import VectorIndexer
from .ingestion_pipeline import (
    IngestionPipeline,
    IngestionReport,
    IngestionStatus,
)
from .preprocessor import TextBlock, preprocess_document

__all__ = [
    "TextBlock",
    "preprocess_document",
    "Chunk",
    "chunk_text_blocks",
    "Embedder",
    "embed_texts",
    "VectorIndexer",
    "IngestionPipeline",
    "IngestionReport",
    "IngestionStatus",
]
