"""Owner-scoped endpoints for managing long-term learning memories."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .deps import Services, get_services
from .models import MemoryDeleteResponse, MemoryListResponse, MemoryResponse

router = APIRouter(prefix="/api", tags=["memories"])


def _serialize_memory(entry) -> MemoryResponse:
    """Convert a stored memory entry to its public, decoded representation."""
    return MemoryResponse(
        id=entry.id,
        memory_type=entry.memory_type,
        key=entry.key,
        value=entry.parsed_value(),
        confidence=entry.confidence,
        created_at=entry.created_at.isoformat(),
        updated_at=entry.updated_at.isoformat(),
    )


@router.get("/memories", response_model=MemoryListResponse)
def list_memories(
    user_id: str = Query(..., min_length=1, max_length=128),
    svc: Services = Depends(get_services),
):
    """List every memory owned by the requesting user."""
    return MemoryListResponse(
        memories=[
            _serialize_memory(entry)
            for entry in svc.memory_store.list_for_user(user_id)
        ]
    )


@router.delete("/memories/{memory_id}", response_model=MemoryDeleteResponse)
def delete_memory(
    memory_id: int,
    user_id: str = Query(..., min_length=1, max_length=128),
    svc: Services = Depends(get_services),
):
    """Delete one memory only when it belongs to the requesting user."""
    if not svc.memory_store.forget_for_user(memory_id, user_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return MemoryDeleteResponse(deleted=1)


@router.delete("/memories", response_model=MemoryDeleteResponse)
def delete_all_memories(
    user_id: str = Query(..., min_length=1, max_length=128),
    svc: Services = Depends(get_services),
):
    """Delete all memories owned by the requesting user."""
    return MemoryDeleteResponse(
        deleted=svc.memory_store.delete_all_for_user(user_id)
    )
