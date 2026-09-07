"""Safe, manifest-driven indexing for canonical knowledge documents."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

from .ingestion_pipeline import IngestionPipeline


DEFAULT_MANIFEST_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "knowledge" / "_index.json"
)
_REQUIRED_ENTRY_FIELDS = ("id", "file", "topic", "difficulty")


def _load_canonical_documents(
    manifest_path: str | Path,
) -> List[Tuple[Path, Dict[str, Any]]]:
    """Load and validate manifest entries before any index mutation occurs."""
    manifest_file = Path(manifest_path).expanduser().resolve()
    try:
        with manifest_file.open(encoding="utf-8") as handle:
            manifest = json.load(handle)
    except FileNotFoundError as exc:
        raise ValueError(
            f"Canonical manifest '{manifest_file}' does not exist."
        ) from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Canonical manifest '{manifest_file}' is not valid JSON: {exc}."
        ) from exc
    except OSError as exc:
        raise ValueError(
            f"Canonical manifest '{manifest_file}' cannot be read: {exc}."
        ) from exc

    if not isinstance(manifest, dict):
        raise ValueError("Canonical manifest must contain a JSON object.")

    documents = manifest.get("documents")
    if not isinstance(documents, list):
        raise ValueError("Canonical manifest field 'documents' must be a list.")
    if not documents:
        raise ValueError(
            "Canonical manifest field 'documents' must contain at least one document."
        )

    manifest_root = manifest_file.parent
    validated_documents: List[Tuple[Path, Dict[str, Any]]] = []
    canonical_ids = set()
    for position, entry in enumerate(documents):
        if not isinstance(entry, dict):
            raise ValueError(
                f"Canonical manifest document at position {position} must be an object."
            )

        missing_fields = [
            field for field in _REQUIRED_ENTRY_FIELDS if field not in entry
        ]
        if missing_fields:
            raise ValueError(
                "Canonical manifest document at position "
                f"{position} is missing required fields: {', '.join(missing_fields)}."
            )

        invalid_fields = [
            field
            for field in _REQUIRED_ENTRY_FIELDS
            if not isinstance(entry[field], str) or not entry[field].strip()
        ]
        if invalid_fields:
            raise ValueError(
                "Canonical manifest document at position "
                f"{position} must provide non-empty string values for: "
                f"{', '.join(invalid_fields)}."
            )

        if entry["id"] in canonical_ids:
            raise ValueError(f"Canonical manifest has duplicate canonical id '{entry['id']}'.")
        canonical_ids.add(entry["id"])

        if "title" in entry and not isinstance(entry["title"], str):
            raise ValueError(
                f"Canonical manifest document at position {position} has a non-string title."
            )

        declared_file = Path(entry["file"])
        if declared_file.is_absolute():
            raise ValueError(
                f"Canonical manifest document at position {position} must use a relative file path."
            )

        source_file = (manifest_root / declared_file).resolve()
        try:
            source_file.relative_to(manifest_root)
        except ValueError as exc:
            raise ValueError(
                "Canonical manifest document at position "
                f"{position} must resolve within the manifest directory."
            ) from exc
        if not source_file.is_file():
            raise ValueError(
                f"Canonical manifest document file '{source_file}' does not exist or is not a regular file."
            )

        validated_documents.append((source_file, entry))

    return validated_documents


def _canonical_metadata(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Construct only the metadata canonical documents are allowed to supply."""
    metadata = {
        "canonical": True,
        "canonical_id": entry["id"],
        "topic": entry["topic"],
        "difficulty": entry["difficulty"],
    }
    if "title" in entry:
        metadata["title"] = entry["title"]
    return metadata


def _status_value(status: Any) -> str:
    """Return an ingestion status string whether it is an enum or a string."""
    return str(getattr(status, "value", status))


def _ingest_canonical_documents(
    pipeline: Any,
    documents: Sequence[Tuple[Path, Dict[str, Any]]],
    attempted_document_ids: List[str] | None = None,
) -> Dict[str, int]:
    """Ingest every validated document and reject any incomplete result."""
    documents_indexed = 0
    chunks_indexed = 0
    incomplete_reports = []

    for source_file, entry in documents:
        document_id = f"canonical:{entry['id']}"
        if attempted_document_ids is not None:
            attempted_document_ids.append(document_id)
        report = pipeline.ingest(
            str(source_file),
            document_id=document_id,
            extra_metadata=_canonical_metadata(entry),
        )
        status = _status_value(report.status)
        if status != "completed":
            incomplete_reports.append(f"{entry['id']} (status={status!r})")
            continue

        documents_indexed += 1
        chunks_indexed += report.num_indexed

    if incomplete_reports:
        raise RuntimeError(
            "Canonical document ingestion did not complete: "
            + ", ".join(incomplete_reports)
        )

    return {"documents": documents_indexed, "chunks": chunks_indexed}


def rebuild_canonical_knowledge(
    pipeline: Any, manifest_path: str | Path
) -> Dict[str, int]:
    """Reset and rebuild the index using only validated manifest documents."""
    documents = _load_canonical_documents(manifest_path)
    strict_reset = getattr(pipeline.indexer, "reset_strict", None)
    if not callable(strict_reset):
        raise RuntimeError(
            "Canonical rebuild requires indexer.reset_strict() "
            "to propagate collection deletion failures."
        )
    strict_reset()
    try:
        return _ingest_canonical_documents(pipeline, documents)
    except Exception as rebuild_error:
        try:
            strict_reset()
        except Exception as cleanup_error:
            raise RuntimeError(
                "Canonical rebuild failed and cleanup failed: "
                f"rebuild error: {rebuild_error}; cleanup error: {cleanup_error}"
            ) from cleanup_error
        raise


def bootstrap_if_empty(
    pipeline: Any, manifest_path: str | Path
) -> Dict[str, int | bool]:
    """Populate an empty index from the canonical manifest without resetting it."""
    strict_is_empty = getattr(pipeline.indexer, "is_empty_strict", None)
    if not callable(strict_is_empty):
        raise RuntimeError(
            "Canonical bootstrap requires indexer.is_empty_strict() "
            "to inspect collection state before ingestion."
        )
    if not strict_is_empty():
        return {"bootstrapped": False, "documents": 0, "chunks": 0}

    delete_document = getattr(pipeline, "delete_document", None)
    if not callable(delete_document):
        raise RuntimeError(
            "Canonical bootstrap requires pipeline.delete_document() "
            "to clean up incomplete ingestion."
        )

    documents = _load_canonical_documents(manifest_path)
    attempted_document_ids: List[str] = []
    try:
        summary = _ingest_canonical_documents(
            pipeline, documents, attempted_document_ids
        )
    except Exception as bootstrap_error:
        cleanup_errors: List[Tuple[str, Exception]] = []
        for document_id in attempted_document_ids:
            try:
                delete_document(document_id)
            except Exception as cleanup_error:
                cleanup_errors.append((document_id, cleanup_error))
        if cleanup_errors:
            cleanup_details = ", ".join(
                f"{document_id}: {cleanup_error}"
                for document_id, cleanup_error in cleanup_errors
            )
            raise RuntimeError(
                "Canonical bootstrap failed and cleanup failed: "
                f"bootstrap error: {bootstrap_error}; cleanup error: {cleanup_details}"
            ) from cleanup_errors[-1][1]
        raise

    return {"bootstrapped": True, **summary}


def main(argv: Sequence[str] | None = None) -> int:
    """Run an explicit, destructive canonical-knowledge rebuild."""
    parser = argparse.ArgumentParser(
        description="Rebuild canonical knowledge from its manifest."
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Reset the vector index before ingesting canonical knowledge.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to the canonical knowledge manifest.",
    )
    args = parser.parse_args(argv)
    if not args.rebuild:
        parser.error("--rebuild is required to reset canonical knowledge.")

    summary = rebuild_canonical_knowledge(IngestionPipeline(), args.manifest)
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised through main()
    raise SystemExit(main())
