"""Document management endpoints.

Handles file upload with background ingestion into the RAG knowledge base,
listing, deletion and per-document status polling. An in-memory registry tracks
document metadata (filename, status, chunk count, timing) since the ingestion
pipeline itself only keeps transient status.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from .deps import Services, get_services
from .models import (
    DeleteResponse,
    DocumentInfo,
    DocumentListResponse,
    DocumentStatusResponse,
    UploadResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["documents"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./data/uploads")


def _status_value(status: Any) -> str:
    """Normalise an IngestionStatus enum (or string) to its string value."""
    return getattr(status, "value", str(status))


def _process_document(
    svc: Services, document_id: str, file_path: str, specialty: str
) -> None:
    """Background task: ingest a saved file and update the registry."""
    entry = svc.document_registry.get(document_id, {})
    try:
        report = svc.ingestion_pipeline.ingest(
            file_path,
            document_id=document_id,
            extra_metadata={"specialty": (specialty or "general").lower()},
        )
        entry.update(
            status=_status_value(report.status),
            num_chunks=report.num_indexed,
            processing_time=report.processing_time,
        )
        logger.info(
            "Ingestion complete for %s: status=%s chunks=%d",
            document_id,
            entry["status"],
            report.num_indexed,
        )
    except Exception as exc:  # pragma: no cover - depends on environment
        logger.exception("Ingestion failed for %s", document_id)
        entry.update(status="failed", error=str(exc))
    svc.document_registry[document_id] = entry


async def _handle_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    specialty: str,
    description: str,
    svc: Services,
) -> UploadResponse:
    """Save the uploaded file and queue background ingestion."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    safe_name = os.path.basename(file.filename or "upload.bin")
    dest = os.path.join(UPLOAD_DIR, f"{document_id}_{safe_name}")

    content = await file.read()
    with open(dest, "wb") as handle:
        handle.write(content)

    svc.document_registry[document_id] = {
        "id": document_id,
        "filename": safe_name,
        "status": "processing",
        "uploaded_at": datetime.now().isoformat(),
        "num_chunks": 0,
        "processing_time": 0.0,
        "specialty": specialty,
        "description": description,
        "path": dest,
    }

    if svc.ingestion_pipeline is not None:
        background_tasks.add_task(
            _process_document, svc, document_id, dest, specialty
        )
    else:
        # No RAG backend available — mark as failed so the UI reflects reality.
        svc.document_registry[document_id]["status"] = "failed"
        svc.document_registry[document_id]["error"] = (
            "Ingestion pipeline unavailable (missing ChromaDB / embeddings)."
        )
        logger.warning(
            "Document %s stored but ingestion pipeline is unavailable.",
            document_id,
        )

    return UploadResponse(
        document_id=document_id,
        status=svc.document_registry[document_id]["status"],
        filename=safe_name,
    )


@router.post("/documents/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    specialty: str = Form("general"),
    description: str = Form(""),
    svc: Services = Depends(get_services),
):
    """Upload a document and queue it for background ingestion."""
    return await _handle_upload(
        background_tasks, file, specialty, description, svc
    )


@router.post("/documents", response_model=UploadResponse)
async def upload_document_alias(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    specialty: str = Form("general"),
    description: str = Form(""),
    svc: Services = Depends(get_services),
):
    """Alias for :func:`upload_document` (the frontend posts to ``/documents``)."""
    return await _handle_upload(
        background_tasks, file, specialty, description, svc
    )


@router.get("/documents", response_model=DocumentListResponse)
def list_documents(svc: Services = Depends(get_services)):
    """List all registered documents, newest first."""
    entries = sorted(
        svc.document_registry.values(),
        key=lambda e: e.get("uploaded_at", ""),
        reverse=True,
    )
    documents = [
        DocumentInfo(
            id=e["id"],
            filename=e.get("filename", ""),
            status=e.get("status", "pending"),
            uploaded_at=e.get("uploaded_at", ""),
            num_chunks=e.get("num_chunks", 0),
        )
        for e in entries
    ]
    return DocumentListResponse(documents=documents)


@router.delete("/documents/{document_id}", response_model=DeleteResponse)
def delete_document(document_id: str, svc: Services = Depends(get_services)):
    """Delete a document from the registry and the knowledge base."""
    existed = document_id in svc.document_registry

    if svc.ingestion_pipeline is not None:
        try:
            svc.ingestion_pipeline.delete_document(document_id)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to delete %s from index: %s", document_id, exc)

    entry = svc.document_registry.pop(document_id, None)
    # Best-effort removal of the stored source file.
    if entry and entry.get("path") and os.path.exists(entry["path"]):
        try:
            os.remove(entry["path"])
        except OSError as exc:  # pragma: no cover - defensive
            logger.debug("Could not remove file %s: %s", entry["path"], exc)

    return DeleteResponse(success=existed)


@router.get(
    "/documents/{document_id}/status", response_model=DocumentStatusResponse
)
def document_status(document_id: str, svc: Services = Depends(get_services)):
    """Return ingestion status for a document."""
    entry = svc.document_registry.get(document_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentStatusResponse(
        document_id=document_id,
        status=entry.get("status", "pending"),
        num_chunks=entry.get("num_chunks", 0),
        processing_time=entry.get("processing_time", 0.0),
    )
