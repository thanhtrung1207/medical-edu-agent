"""Tests for the document-ingestion pipeline.

Preprocessor and chunker tests are pure-Python and always run. Embedder and
full-pipeline tests need ``sentence-transformers`` / ``chromadb`` and are marked
``slow``; they skip gracefully when those optional dependencies are missing.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from packaging.requirements import Requirement
from packaging.version import Version

from tools.document_ingestion import (
    Chunk,
    TextBlock,
    VectorIndexer,
    chunk_text_blocks,
    preprocess_document,
)


class TestDependencyContracts:
    def test_chromadb_requirement_supports_not_found_error(self):
        requirements_path = Path(__file__).resolve().parents[1] / "requirements.txt"
        requirements = [
            Requirement(line)
            for line in requirements_path.read_text(encoding="utf-8").splitlines()
            if line and not line.startswith("#")
        ]
        chromadb = next(
            requirement
            for requirement in requirements
            if requirement.name == "chromadb"
        )
        minimum_version = next(
            Version(specifier.version)
            for specifier in chromadb.specifier
            if specifier.operator == ">="
        )

        assert minimum_version >= Version("1.5.9")


class TestPreprocessor:
    def test_extract_txt(self, tmp_path):
        """Extract text from .txt file."""
        path = tmp_path / "doc.txt"
        path.write_text(
            "Nhồi máu cơ tim là bệnh tim mạch nguy hiểm.", encoding="utf-8"
        )

        blocks = preprocess_document(str(path))

        assert len(blocks) >= 1
        assert "Nhồi máu cơ tim" in blocks[0].content
        assert blocks[0].metadata["source_file"] == "doc.txt"

    def test_extract_markdown(self, tmp_path, sample_medical_text):
        """Extract text from .md file (split by headings)."""
        path = tmp_path / "doc.md"
        path.write_text(sample_medical_text, encoding="utf-8")

        blocks = preprocess_document(str(path))

        assert len(blocks) >= 2
        sections = [b.metadata.get("section") for b in blocks]
        assert any(s and "Triệu chứng" in s for s in sections)

    def test_unsupported_format(self, tmp_path):
        """Gracefully handle unsupported formats."""
        path = tmp_path / "doc.xyz"
        path.write_text("data", encoding="utf-8")

        with pytest.raises(ValueError):
            preprocess_document(str(path))


class TestChunker:
    def test_basic_chunking(self):
        """Text is split into appropriate chunk sizes."""
        block = TextBlock(
            content="Đây là một đoạn văn bản y khoa mẫu. " * 60,
            metadata={"source_file": "x.txt"},
        )

        chunks = chunk_text_blocks([block], max_chars=200, overlap_ratio=0.1)

        assert len(chunks) > 1
        assert all(isinstance(c, Chunk) for c in chunks)

    def test_respects_paragraph_boundaries(self):
        """Chunks don't split mid-paragraph when paragraphs fit."""
        para1 = "A" * 600
        para2 = "B" * 600
        block = TextBlock(content=f"{para1}\n\n{para2}", metadata={})

        chunks = chunk_text_blocks(
            [block], max_chars=800, overlap_ratio=0.0
        )

        assert len(chunks) == 2
        assert chunks[0].text == para1
        assert chunks[1].text == para2

    def test_overlap(self):
        """Adjacent chunks have proper overlap."""
        para1 = "A" * 600
        para2 = "B" * 600
        block = TextBlock(content=f"{para1}\n\n{para2}", metadata={})

        chunks = chunk_text_blocks(
            [block], max_chars=800, overlap_ratio=0.15
        )

        assert len(chunks) == 2
        # The second chunk is prefixed with a tail of the first ('A's).
        assert chunks[1].text.startswith("A")
        assert "B" in chunks[1].text

    def test_metadata_preservation(self):
        """Chunk metadata (page, section) is preserved."""
        block = TextBlock(
            content="Nội dung y khoa ngắn gọn.",
            metadata={
                "source_file": "book.pdf",
                "page": 5,
                "section": "Tim mạch",
                "chapter": "Chương 1",
            },
        )

        chunks = chunk_text_blocks([block])

        assert chunks[0].metadata["source_file"] == "book.pdf"
        assert chunks[0].metadata["page_number"] == 5
        assert chunks[0].metadata["section_title"] == "Tim mạch"
        assert chunks[0].metadata["chapter"] == "Chương 1"
        assert chunks[0].metadata["chunk_index"] == 0


class TestVectorIndexer:
    def test_is_empty_strict_propagates_collection_errors(self, monkeypatch):
        indexer = VectorIndexer()

        def unavailable_collection():
            raise RuntimeError("collection unavailable")

        monkeypatch.setattr(indexer, "_get_collection", unavailable_collection)

        with pytest.raises(RuntimeError, match="collection unavailable"):
            indexer.is_empty_strict()

    def test_reset_strict_propagates_unexpected_deletion_errors(self, monkeypatch):
        indexer = VectorIndexer()

        class FailingClient:
            def delete_collection(self, name):
                raise RuntimeError("collection deletion failed")

        monkeypatch.setattr(indexer, "_get_client", lambda: FailingClient())

        with pytest.raises(RuntimeError, match="collection deletion failed"):
            indexer.reset_strict()

    def test_reset_strict_accepts_any_missing_collection_message(self, monkeypatch):
        from chromadb.errors import NotFoundError

        indexer = VectorIndexer(collection_name="canonical_knowledge")
        indexer._collection = object()

        class MissingCollectionClient:
            def delete_collection(self, name):
                raise NotFoundError("collection was already removed")

        monkeypatch.setattr(indexer, "_get_client", lambda: MissingCollectionClient())

        indexer.reset_strict()

        assert indexer._collection is None


@pytest.mark.slow
class TestEmbedder:
    def test_embedding_generation(self):
        """Generate embeddings for text (skips if model not available)."""
        pytest.importorskip("sentence_transformers")
        from tools.document_ingestion import Embedder

        embedder = Embedder()
        vectors = embedder.embed(["Nhồi máu cơ tim gây đau ngực."])

        assert len(vectors) == 1
        assert len(vectors[0]) == embedder.dimension

    def test_batch_embedding(self):
        """Batch embedding works correctly."""
        pytest.importorskip("sentence_transformers")
        from tools.document_ingestion import Embedder

        embedder = Embedder()
        vectors = embedder.embed(["một", "hai", "ba"])

        assert len(vectors) == 3


@pytest.mark.slow
class TestIngestionPipeline:
    def test_full_pipeline_txt(self, ingestion_pipeline, tmp_path, sample_medical_text):
        """End-to-end ingestion of a .txt file."""
        from tools.document_ingestion import IngestionStatus

        path = tmp_path / "doc.txt"
        path.write_text(sample_medical_text, encoding="utf-8")

        report = ingestion_pipeline.ingest(str(path), document_id="doc1")

        assert report.num_chunks > 0
        assert report.num_indexed > 0
        assert report.status == IngestionStatus.COMPLETED

    def test_delete_document(self, ingestion_pipeline, tmp_path):
        """Delete a document and its chunks."""
        from tools.document_ingestion import IngestionStatus

        path = tmp_path / "doc.txt"
        path.write_text("Nội dung y khoa để kiểm thử.", encoding="utf-8")
        ingestion_pipeline.ingest(str(path), document_id="doc_del")

        ingestion_pipeline.delete_document("doc_del")

        assert ingestion_pipeline.get_status("doc_del") == IngestionStatus.PENDING
