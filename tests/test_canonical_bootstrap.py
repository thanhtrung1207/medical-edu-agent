"""Tests for deterministic canonical knowledge indexing."""

from __future__ import annotations

import errno
import json
import sys
import types
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

import pytest

from tools.document_ingestion import bootstrap
from tools.document_ingestion.bootstrap import (
    bootstrap_if_empty,
    rebuild_canonical_knowledge,
)


class FakeStatus(Enum):
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"


@dataclass
class FakeReport:
    status: object = "completed"
    num_indexed: int = 1


class FakeIndexer:
    def __init__(
        self, empty: bool, strict_reset_errors: list[Exception | None] | None = None
    ) -> None:
        self.empty = empty
        self.reset_calls = 0
        self.reset_strict_calls = 0
        self._strict_reset_errors = iter(strict_reset_errors or [])

    def is_empty(self) -> bool:
        return self.empty

    def is_empty_strict(self) -> bool:
        return self.empty

    def reset(self) -> None:
        self.reset_calls += 1

    def reset_strict(self) -> None:
        self.reset_strict_calls += 1
        error = next(self._strict_reset_errors, None)
        if error is not None:
            raise error


class LegacyOnlyIndexer:
    def __init__(self) -> None:
        self.legacy_inspection_calls = 0
        self.reset_calls = 0

    def is_empty(self) -> bool:
        self.legacy_inspection_calls += 1
        return True

    def reset(self) -> None:
        self.reset_calls += 1


class StrictInspectionFailingIndexer(FakeIndexer):
    def is_empty_strict(self) -> bool:
        raise RuntimeError("collection inspection failed")


class StrictResetFailingIndexer(FakeIndexer):
    def reset_strict(self) -> None:
        self.reset_strict_calls += 1
        raise RuntimeError("collection deletion failed")


class FakePipeline:
    def __init__(
        self,
        empty: bool = True,
        reports: list[FakeReport] | None = None,
        delete_errors: list[Exception | None] | None = None,
    ) -> None:
        self.indexer = FakeIndexer(empty)
        self.calls: list[tuple[str, str, dict]] = []
        self.delete_calls: list[str] = []
        self._reports = iter(reports or [])
        self._delete_errors = iter(delete_errors or [])

    def ingest(self, file_path: str, document_id: str, extra_metadata: dict) -> FakeReport:
        self.calls.append((file_path, document_id, extra_metadata))
        return next(self._reports, FakeReport())

    def delete_document(self, document_id: str) -> None:
        self.delete_calls.append(document_id)
        error = next(self._delete_errors, None)
        if error is not None:
            raise error


def write_manifest(tmp_path: Path) -> Path:
    knowledge_dir = tmp_path / "knowledge"
    (knowledge_dir / "Foundation").mkdir(parents=True)
    (knowledge_dir / "Intermediate").mkdir()
    (knowledge_dir / "Foundation" / "fracture.md").write_text("fracture")
    (knowledge_dir / "Intermediate" / "ferrule.md").write_text("ferrule")
    (knowledge_dir / "legacy.md").write_text("legacy backup")
    manifest = knowledge_dir / "_index.json"
    manifest.write_text(
        json.dumps(
            {
                "version": 1,
                "documents": [
                    {
                        "id": "fracture",
                        "file": "Foundation/fracture.md",
                        "topic": "tooth_fracture",
                        "difficulty": "foundation",
                    },
                    {
                        "id": "ferrule",
                        "file": "Intermediate/ferrule.md",
                        "topic": "tooth_fracture",
                        "difficulty": "intermediate",
                        "title": "Ferrule restoration",
                    },
                ],
            }
        )
    )
    return manifest


def test_rebuild_uses_only_manifest_documents_in_order(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(
        reports=[
            FakeReport(status=FakeStatus.COMPLETED),
            FakeReport(status=FakeStatus.COMPLETED),
        ]
    )

    summary = rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 1
    assert [call[1] for call in pipeline.calls] == [
        "canonical:fracture",
        "canonical:ferrule",
    ]
    assert [Path(call[0]).name for call in pipeline.calls] == ["fracture.md", "ferrule.md"]
    assert [call[2] for call in pipeline.calls] == [
        {
            "canonical": True,
            "canonical_id": "fracture",
            "topic": "tooth_fracture",
            "difficulty": "foundation",
        },
        {
            "canonical": True,
            "canonical_id": "ferrule",
            "topic": "tooth_fracture",
            "difficulty": "intermediate",
            "title": "Ferrule restoration",
        },
    ]
    assert summary == {"documents": 2, "chunks": 2}


def test_rebuild_prevalidates_missing_files_before_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    (manifest.parent / "Intermediate" / "ferrule.md").unlink()
    pipeline = FakePipeline()

    with pytest.raises(ValueError, match="does not exist"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0
    assert pipeline.calls == []


def test_rebuild_rejects_parent_traversal_before_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    outside_file = tmp_path / "outside.md"
    outside_file.write_text("outside canonical knowledge")
    manifest_data = json.loads(manifest.read_text())
    manifest_data["documents"][0]["file"] = "../outside.md"
    manifest.write_text(json.dumps(manifest_data))
    pipeline = FakePipeline()

    with pytest.raises(ValueError, match="within the manifest directory"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0
    assert pipeline.calls == []


def test_rebuild_rejects_symlink_escaping_manifest_directory_before_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    outside_file = tmp_path / "outside.md"
    outside_file.write_text("outside canonical knowledge")
    escaping_link = manifest.parent / "Foundation" / "escape.md"
    try:
        escaping_link.symlink_to(outside_file)
    except NotImplementedError as exc:
        pytest.skip(f"symlinks are unsupported in this test environment: {exc}")
    except OSError as exc:
        if exc.errno not in (errno.EACCES, errno.EPERM, errno.ENOSYS):
            raise
        pytest.skip(f"symlinks are unsupported in this test environment: {exc}")

    manifest_data = json.loads(manifest.read_text())
    manifest_data["documents"][0]["file"] = "Foundation/escape.md"
    manifest.write_text(json.dumps(manifest_data))
    pipeline = FakePipeline()

    with pytest.raises(ValueError, match="within the manifest directory"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0
    assert pipeline.calls == []


def test_rebuild_rejects_duplicate_ids_before_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    manifest_data = json.loads(manifest.read_text())
    manifest_data["documents"][1]["id"] = "fracture"
    manifest.write_text(json.dumps(manifest_data))
    pipeline = FakePipeline()

    with pytest.raises(ValueError, match="duplicate canonical id 'fracture'"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0
    assert pipeline.calls == []


def test_rebuild_requires_strict_reset_before_ingestion(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline()
    pipeline.indexer = LegacyOnlyIndexer()

    with pytest.raises(RuntimeError, match="reset_strict"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.calls == []


def test_rebuild_does_not_ingest_when_strict_reset_fails(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline()
    pipeline.indexer = StrictResetFailingIndexer(empty=True)

    with pytest.raises(RuntimeError, match="collection deletion failed"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 1
    assert pipeline.calls == []


def test_rebuild_prevalidates_manifest_before_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    manifest.write_text(json.dumps({"documents": [{"id": "fracture"}]}))
    pipeline = FakePipeline()

    with pytest.raises(ValueError, match="missing required fields"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.calls == []


def test_rebuild_rejects_empty_manifest_before_reset_or_ingestion(tmp_path):
    manifest = write_manifest(tmp_path)
    manifest.write_text(json.dumps({"documents": []}))
    pipeline = FakePipeline()

    with pytest.raises(ValueError, match="at least one document"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0
    assert pipeline.calls == []


def test_rebuild_reports_cleanup_failure_after_partial_ingestion(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(reports=[FakeReport(status=FakeStatus.PARTIAL)])
    pipeline.indexer = FakeIndexer(
        empty=True,
        strict_reset_errors=[None, RuntimeError("cleanup deletion failed")],
    )

    with pytest.raises(RuntimeError) as error:
        rebuild_canonical_knowledge(pipeline, manifest)

    assert "Canonical document ingestion did not complete" in str(error.value)
    assert "cleanup failed" in str(error.value)
    assert "cleanup deletion failed" in str(error.value)
    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 2
    assert len(pipeline.calls) == 2


@pytest.mark.parametrize("status", [FakeStatus.PARTIAL, "failed"])
def test_rebuild_rejects_noncompleted_ingestion_reports(tmp_path, status):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(reports=[FakeReport(status=status)])

    with pytest.raises(RuntimeError, match="did not complete"):
        rebuild_canonical_knowledge(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 2
    assert len(pipeline.calls) == 2


def test_bootstrap_skips_nonempty_collection(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(empty=False)

    summary = bootstrap_if_empty(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.calls == []
    assert summary == {"bootstrapped": False, "documents": 0, "chunks": 0}


def test_bootstrap_requires_strict_inspection_before_ingest_or_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline()
    pipeline.indexer = LegacyOnlyIndexer()

    with pytest.raises(RuntimeError, match="is_empty_strict"):
        bootstrap_if_empty(pipeline, manifest)

    assert pipeline.indexer.legacy_inspection_calls == 0
    assert pipeline.indexer.reset_calls == 0
    assert pipeline.calls == []


def test_bootstrap_fails_closed_when_strict_inspection_fails(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline()
    pipeline.indexer = StrictInspectionFailingIndexer(empty=True)

    with pytest.raises(RuntimeError, match="collection inspection failed"):
        bootstrap_if_empty(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert pipeline.calls == []


def test_bootstrap_ingests_empty_collection_without_reset(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(empty=True)

    summary = bootstrap_if_empty(pipeline, manifest)

    assert pipeline.indexer.reset_calls == 0
    assert [call[1] for call in pipeline.calls] == [
        "canonical:fracture",
        "canonical:ferrule",
    ]
    assert summary == {"bootstrapped": True, "documents": 2, "chunks": 2}


def test_bootstrap_cleans_up_every_canonical_document_after_partial_ingestion(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(
        reports=[
            FakeReport(status=FakeStatus.PARTIAL),
            FakeReport(status=FakeStatus.COMPLETED),
        ]
    )

    with pytest.raises(RuntimeError, match="Canonical document ingestion did not complete"):
        bootstrap_if_empty(pipeline, manifest)

    assert pipeline.delete_calls == ["canonical:fracture", "canonical:ferrule"]
    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0


def test_bootstrap_reports_ingestion_and_cleanup_failures(tmp_path):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline(
        reports=[
            FakeReport(status=FakeStatus.PARTIAL),
            FakeReport(status=FakeStatus.COMPLETED),
        ],
        delete_errors=[RuntimeError("delete fracture failed")],
    )

    with pytest.raises(RuntimeError) as error:
        bootstrap_if_empty(pipeline, manifest)

    assert "Canonical document ingestion did not complete" in str(error.value)
    assert "cleanup failed" in str(error.value)
    assert "delete fracture failed" in str(error.value)
    assert pipeline.delete_calls == ["canonical:fracture", "canonical:ferrule"]
    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 0


def test_cli_requires_rebuild_before_constructing_pipeline(monkeypatch):
    pipelines: list[FakePipeline] = []

    def make_pipeline() -> FakePipeline:
        pipeline = FakePipeline()
        pipelines.append(pipeline)
        return pipeline

    monkeypatch.setattr(bootstrap, "IngestionPipeline", make_pipeline)

    with pytest.raises(SystemExit) as error:
        bootstrap.main([])

    assert error.value.code == 2
    assert pipelines == []


def test_cli_rebuilds_the_default_manifest(tmp_path, monkeypatch):
    manifest = write_manifest(tmp_path)
    pipeline = FakePipeline()

    monkeypatch.setattr(bootstrap, "DEFAULT_MANIFEST_PATH", manifest)
    monkeypatch.setattr(bootstrap, "IngestionPipeline", lambda: pipeline)

    assert bootstrap.main(["--rebuild"]) == 0
    assert pipeline.indexer.reset_calls == 0
    assert pipeline.indexer.reset_strict_calls == 1
    assert len(pipeline.calls) == 2


def _install_service_startup_fakes(monkeypatch, bootstrap_if_empty):
    """Install lightweight modules used by ``Services.startup``."""
    created_pipelines = []

    class SessionManager:
        def __init__(self, db_path):
            self.db_path = db_path

    class MemoryStore:
        def __init__(self, db_path):
            self.db_path = db_path

    class ContextBuilder:
        def __init__(self, session_manager, memory_store):
            self.session_manager = session_manager
            self.memory_store = memory_store

    class LearningDatabase:
        def __init__(self, db_path):
            self.db_path = db_path

    class FeedbackCollector:
        def __init__(self, learning_db):
            self.learning_db = learning_db

    class AdaptiveEngine:
        def __init__(self, learning_db):
            self.learning_db = learning_db

    def construct_pipeline():
        pipeline = object()
        created_pipelines.append(pipeline)
        return pipeline

    fake_memory = types.ModuleType("memory")
    fake_memory.ContextBuilder = ContextBuilder
    fake_memory.MemoryStore = MemoryStore
    fake_memory.SessionManager = SessionManager

    fake_learning = types.ModuleType("learning")
    fake_learning.AdaptiveEngine = AdaptiveEngine
    fake_learning.FeedbackCollector = FeedbackCollector
    fake_learning.LearningDatabase = LearningDatabase

    fake_root_agent = types.ModuleType("agents.root_agent")
    fake_root_agent.guardrail_runner = object()
    fake_root_agent.reasoning_workflow = object()
    fake_agents = types.ModuleType("agents")
    fake_agents.root_agent = fake_root_agent

    fake_bootstrap = types.ModuleType("tools.document_ingestion.bootstrap")
    fake_bootstrap.DEFAULT_MANIFEST_PATH = bootstrap.DEFAULT_MANIFEST_PATH
    fake_bootstrap.bootstrap_if_empty = bootstrap_if_empty
    fake_document_ingestion = types.ModuleType("tools.document_ingestion")
    fake_document_ingestion.bootstrap = fake_bootstrap
    fake_tools = types.ModuleType("tools")
    fake_tools.IngestionPipeline = construct_pipeline
    fake_tools.document_ingestion = fake_document_ingestion

    monkeypatch.setitem(sys.modules, "memory", fake_memory)
    monkeypatch.setitem(sys.modules, "learning", fake_learning)
    monkeypatch.setitem(sys.modules, "agents", fake_agents)
    monkeypatch.setitem(sys.modules, "agents.root_agent", fake_root_agent)
    monkeypatch.setitem(sys.modules, "tools", fake_tools)
    monkeypatch.setitem(sys.modules, "tools.document_ingestion", fake_document_ingestion)
    monkeypatch.setitem(
        sys.modules, "tools.document_ingestion.bootstrap", fake_bootstrap
    )
    return created_pipelines


@pytest.mark.parametrize("setting", [None, "rebuild"])
def test_service_startup_skips_canonical_bootstrap_without_opt_in(
    monkeypatch, setting
):
    calls = []

    def unexpected_bootstrap(*args):
        calls.append(args)
        raise AssertionError("bootstrap must remain disabled")

    if setting is None:
        monkeypatch.delenv("CANONICAL_KNOWLEDGE_BOOTSTRAP", raising=False)
    else:
        monkeypatch.setenv("CANONICAL_KNOWLEDGE_BOOTSTRAP", setting)
    pipelines = _install_service_startup_fakes(monkeypatch, unexpected_bootstrap)

    from api.deps import Services

    service = Services()
    service.startup()

    assert calls == []
    assert service.ingestion_pipeline is pipelines[0]
    assert service._started is True


def test_service_startup_bootstraps_with_canonical_manifest_when_opted_in(monkeypatch):
    calls = []

    def record_bootstrap(pipeline, manifest_path):
        calls.append((pipeline, manifest_path))
        return {"bootstrapped": False, "documents": 0, "chunks": 0}

    monkeypatch.setenv("CANONICAL_KNOWLEDGE_BOOTSTRAP", "if-empty")
    pipelines = _install_service_startup_fakes(monkeypatch, record_bootstrap)

    from api.deps import Services

    service = Services()
    service.startup()

    assert calls == [(pipelines[0], bootstrap.DEFAULT_MANIFEST_PATH)]
    assert service.ingestion_pipeline is pipelines[0]
    assert service._started is True


def test_service_startup_keeps_pipeline_when_bootstrap_fails(monkeypatch, caplog):
    calls = []

    def failing_bootstrap(pipeline, manifest_path):
        calls.append((pipeline, manifest_path))
        raise RuntimeError("manifest unavailable")

    monkeypatch.setenv("CANONICAL_KNOWLEDGE_BOOTSTRAP", "if-empty")
    pipelines = _install_service_startup_fakes(monkeypatch, failing_bootstrap)
    caplog.set_level("ERROR", logger="api.deps")

    from api.deps import Services

    service = Services()
    service.startup()

    assert calls == [(pipelines[0], bootstrap.DEFAULT_MANIFEST_PATH)]
    assert service.ingestion_pipeline is pipelines[0]
    assert service._started is True
    assert "Canonical knowledge bootstrap failed" in caplog.text
