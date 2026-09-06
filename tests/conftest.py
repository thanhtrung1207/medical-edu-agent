"""Shared pytest fixtures and configuration for the test suite.

All database-backed fixtures use pytest's ``tmp_path`` so tests never touch the
real application databases. Fixtures that depend on optional heavy dependencies
(ChromaDB, sentence-transformers, google-adk) skip gracefully when those
packages are not installed.
"""

from __future__ import annotations

import os
import sys

import pytest

# Ensure the project root is importable regardless of the invocation directory.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# --------------------------------------------------------------------------- #
# Markers
# --------------------------------------------------------------------------- #
def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers so ``-W error`` runs stay warning-free."""
    config.addinivalue_line(
        "markers",
        "slow: marks tests that need ML models or external services "
        "(deselect with '-m \"not slow\"').",
    )


# --------------------------------------------------------------------------- #
# Database path / instance fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture
def tmp_db(tmp_path):
    """Return a temporary SQLite database file path (auto-cleaned)."""
    return str(tmp_path / "test.db")


@pytest.fixture
def learning_db(tmp_path):
    """Return an initialized :class:`LearningDatabase` on a temp DB."""
    from learning import LearningDatabase

    return LearningDatabase(str(tmp_path / "learning.db"))


@pytest.fixture
def session_manager(tmp_path):
    """Return a :class:`SessionManager` backed by a temp DB."""
    from memory import SessionManager

    return SessionManager(str(tmp_path / "sessions.db"))


@pytest.fixture
def memory_store(tmp_path):
    """Return a :class:`MemoryStore` backed by a temp DB."""
    from memory import MemoryStore

    return MemoryStore(str(tmp_path / "memory.db"))


@pytest.fixture
def ingestion_pipeline(tmp_path):
    """Return an :class:`IngestionPipeline` using a temp ChromaDB.

    Skips when ChromaDB or sentence-transformers is not installed.
    """
    pytest.importorskip("chromadb")
    pytest.importorskip("sentence_transformers")

    from tools.document_ingestion.indexer import VectorIndexer
    from tools.document_ingestion.ingestion_pipeline import IngestionPipeline

    indexer = VectorIndexer(
        persist_dir=str(tmp_path / "chroma"),
        collection_name="test_collection",
    )
    return IngestionPipeline(indexer=indexer)


# --------------------------------------------------------------------------- #
# FastAPI test client
# --------------------------------------------------------------------------- #
@pytest.fixture
def test_client(tmp_path, monkeypatch):
    """Return a FastAPI :class:`TestClient` wired to temporary databases.

    The shared service singleton is reset and re-initialised against temp DB
    paths so each test gets an isolated backend. Skips when google-adk (needed
    to construct the root agent during startup) is unavailable.
    """
    pytest.importorskip("google.adk")

    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.db"))
    monkeypatch.setenv("MEMORY_DB_PATH", str(tmp_path / "memory.db"))
    monkeypatch.setenv("LEARNING_DB_PATH", str(tmp_path / "learning.db"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))

    from fastapi.testclient import TestClient

    import main
    from api.deps import services

    # Force a fresh startup so the new temp DB paths take effect and in-memory
    # registries start empty for this test.
    services._started = False
    services.document_registry.clear()
    services.quiz_store.clear()
    services.quiz_history.clear()

    with TestClient(main.app) as client:
        yield client


# --------------------------------------------------------------------------- #
# Sample data
# --------------------------------------------------------------------------- #
@pytest.fixture
def sample_medical_text():
    """Return a sample Vietnamese medical text (with headings) for tests."""
    return (
        "# Nhồi máu cơ tim cấp\n"
        "\n"
        "Nhồi máu cơ tim cấp là tình trạng hoại tử một vùng cơ tim do thiếu "
        "máu cục bộ kéo dài. Nguyên nhân thường gặp nhất là do huyết khối gây "
        "tắc nghẽn động mạch vành.\n"
        "\n"
        "## Triệu chứng lâm sàng\n"
        "\n"
        "Triệu chứng chính là đau ngực dữ dội sau xương ức, đau có thể lan lên "
        "vai trái và cánh tay trái. Bệnh nhân thường kèm theo khó thở, vã mồ "
        "hôi và cảm giác lo lắng.\n"
        "\n"
        "## Chẩn đoán\n"
        "\n"
        "Chẩn đoán dựa vào điện tâm đồ (ECG) với hình ảnh ST chênh lên và men "
        "tim tăng cao như troponin. Siêu âm tim giúp đánh giá rối loạn vận "
        "động vùng.\n"
    )
