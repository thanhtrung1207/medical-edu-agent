"""ChromaDB Vector Indexer.

Wraps a persistent ChromaDB collection to store and query text chunk
embeddings together with their text and metadata.

Configuration is read from environment variables:
    - ``CHROMA_PERSIST_DIR``     (default: ``./data/embeddings``)
    - ``CHROMA_COLLECTION_NAME`` (default: ``medical_knowledge``)

The ChromaDB client is created lazily so this module can be imported without
the ``chromadb`` dependency installed.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_PERSIST_DIR = "./data/embeddings"
DEFAULT_COLLECTION_NAME = "medical_knowledge"


def _sanitize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce metadata into ChromaDB-compatible scalar values.

    ChromaDB only accepts str/int/float/bool values; ``None`` and other types
    are converted to safe defaults.
    """
    clean: Dict[str, Any] = {}
    for key, value in (metadata or {}).items():
        if value is None:
            continue
        if isinstance(value, (str, int, float, bool)):
            clean[key] = value
        else:
            clean[key] = str(value)
    return clean


class VectorIndexer:
    """Manage a persistent ChromaDB collection for medical knowledge chunks.

    Args:
        persist_dir: Directory to persist the ChromaDB data. Defaults to the
            ``CHROMA_PERSIST_DIR`` environment variable.
        collection_name: Collection name. Defaults to the
            ``CHROMA_COLLECTION_NAME`` environment variable.
    """

    def __init__(
        self,
        persist_dir: Optional[str] = None,
        collection_name: Optional[str] = None,
    ) -> None:
        self.persist_dir = persist_dir or os.getenv(
            "CHROMA_PERSIST_DIR", DEFAULT_PERSIST_DIR
        )
        self.collection_name = collection_name or os.getenv(
            "CHROMA_COLLECTION_NAME", DEFAULT_COLLECTION_NAME
        )
        self._client = None
        self._collection = None

    # -- Lazy client / collection -----------------------------------------

    def _get_client(self):
        """Create (once) and return the persistent ChromaDB client."""
        if self._client is not None:
            return self._client

        try:
            import chromadb  # type: ignore
            from chromadb.config import Settings  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "chromadb is required for indexing. Install with 'pip install chromadb'."
            ) from exc

        os.makedirs(self.persist_dir, exist_ok=True)
        logger.info(
            "Initializing ChromaDB (persist_dir=%s, collection=%s)",
            self.persist_dir,
            self.collection_name,
        )
        self._client = chromadb.PersistentClient(
            path=self.persist_dir,
            settings=Settings(anonymized_telemetry=False, allow_reset=False),
        )
        return self._client

    def _get_collection(self):
        """Get or create the ChromaDB collection."""
        if self._collection is None:
            client = self._get_client()
            self._collection = client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    # -- Operations --------------------------------------------------------

    def count(self) -> int:
        """Return the number of items stored in the collection."""
        try:
            return int(self._get_collection().count())
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to count collection: %s", exc)
            return 0

    def is_empty(self) -> bool:
        """Return True if the collection has no documents."""
        return self.count() == 0

    def add(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
    ) -> int:
        """Add embedded chunks to the collection.

        Args:
            ids: Unique IDs for each chunk.
            embeddings: Embedding vector for each chunk.
            documents: Raw text for each chunk.
            metadatas: Metadata dict for each chunk.

        Returns:
            The number of items added.
        """
        if not ids:
            return 0
        if not (len(ids) == len(embeddings) == len(documents) == len(metadatas)):
            raise ValueError("ids, embeddings, documents and metadatas must be equal length")

        collection = self._get_collection()
        clean_metadatas = [_sanitize_metadata(m) for m in metadatas]
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=clean_metadatas,
        )
        logger.info("Added %d item(s) to collection '%s'", len(ids), self.collection_name)
        return len(ids)

    def query(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        where: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Query the collection for the most similar chunks.

        Args:
            query_embedding: The query embedding vector.
            top_k: Maximum number of results.
            where: Optional metadata filter (ChromaDB ``where`` clause).

        Returns:
            A list of result dicts with keys ``id``, ``text``, ``metadata``
            and ``distance``. Returns an empty list if the collection is empty.
        """
        if self.is_empty():
            logger.info("Query on empty collection '%s' -> no results", self.collection_name)
            return []

        collection = self._get_collection()
        query_kwargs: Dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": max(1, top_k),
        }
        if where:
            query_kwargs["where"] = where

        raw = collection.query(**query_kwargs)

        results: List[Dict[str, Any]] = []
        ids = (raw.get("ids") or [[]])[0]
        documents = (raw.get("documents") or [[]])[0]
        metadatas = (raw.get("metadatas") or [[]])[0]
        distances = (raw.get("distances") or [[]])[0]

        for i, doc_id in enumerate(ids):
            results.append(
                {
                    "id": doc_id,
                    "text": documents[i] if i < len(documents) else "",
                    "metadata": metadatas[i] if i < len(metadatas) else {},
                    "distance": distances[i] if i < len(distances) else None,
                }
            )
        return results

    def delete_by_document_id(self, document_id: str) -> None:
        """Delete all chunks belonging to a given source document.

        Args:
            document_id: The ``document_id`` metadata value to match.
        """
        collection = self._get_collection()
        collection.delete(where={"document_id": document_id})
        logger.info("Deleted chunks for document_id='%s'", document_id)

    def delete_by_ids(self, ids: List[str]) -> None:
        """Delete specific chunk IDs from the collection."""
        if not ids:
            return
        self._get_collection().delete(ids=ids)
        logger.info("Deleted %d chunk id(s)", len(ids))

    def reset(self) -> None:
        """Delete the entire collection (irreversible)."""
        client = self._get_client()
        try:
            client.delete_collection(self.collection_name)
        except Exception as exc:  # pragma: no cover - collection may not exist
            logger.warning("Failed to delete collection: %s", exc)
        self._collection = None
        logger.info("Reset collection '%s'", self.collection_name)
