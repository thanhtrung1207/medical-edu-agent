"""Tools package for the Medical Education AI Agent.

Exposes the agent-facing tool functions (RAG search, drug lookup, anatomy
lookup) and the document ingestion pipeline for building the knowledge base.

Example:
    >>> from tools import search_medical_knowledge, IngestionPipeline
"""

from __future__ import annotations

from .anatomy_tool import search_anatomy
from .document_ingestion import (
    Chunk,
    Embedder,
    IngestionPipeline,
    IngestionReport,
    IngestionStatus,
    TextBlock,
    VectorIndexer,
    chunk_text_blocks,
    embed_texts,
    preprocess_document,
)
from .drug_lookup import lookup_drug_info
from .medical_search import (
    format_citations,
    retrieve,
    search_medical_knowledge,
)

__all__ = [
    # Agent-facing tools
    "search_medical_knowledge",
    "lookup_drug_info",
    "search_anatomy",
    # Retrieval helpers
    "retrieve",
    "format_citations",
    # Ingestion pipeline
    "IngestionPipeline",
    "IngestionReport",
    "IngestionStatus",
    "preprocess_document",
    "TextBlock",
    "chunk_text_blocks",
    "Chunk",
    "Embedder",
    "embed_texts",
    "VectorIndexer",
]
