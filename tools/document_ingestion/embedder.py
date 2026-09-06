"""Embedding Generation.

Generates dense vector embeddings for text chunks using
``sentence-transformers`` (default model: ``all-MiniLM-L6-v2``).

The model is loaded lazily and cached per model name so that importing this
module is cheap and does not require the (large) dependency to be installed
until embeddings are actually requested.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"
# all-MiniLM-L6-v2 produces 384-dimensional embeddings.
DEFAULT_EMBEDDING_DIM = 384
# Model input token limit; longer text is truncated by the transformer.
_MAX_SEQ_CHARS = 2000
DEFAULT_BATCH_SIZE = 32

# Cache of loaded models keyed by model name.
_MODEL_CACHE: Dict[str, object] = {}


def _load_model(model_name: str):
    """Load (and cache) a SentenceTransformer model.

    Args:
        model_name: The sentence-transformers model identifier.

    Returns:
        The loaded model instance.

    Raises:
        RuntimeError: If sentence-transformers is not installed.
    """
    if model_name in _MODEL_CACHE:
        return _MODEL_CACHE[model_name]

    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "sentence-transformers is required to generate embeddings. "
            "Install with 'pip install sentence-transformers'."
        ) from exc

    logger.info("Loading embedding model '%s'...", model_name)
    model = SentenceTransformer(model_name)
    _MODEL_CACHE[model_name] = model
    return model


class Embedder:
    """Wrapper around a sentence-transformers embedding model.

    Args:
        model_name: The model identifier. Defaults to the ``EMBEDDING_MODEL``
            environment variable or :data:`DEFAULT_MODEL_NAME`.
        batch_size: Number of texts to encode per batch.
    """

    def __init__(
        self,
        model_name: Optional[str] = None,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> None:
        self.model_name = model_name or os.getenv("EMBEDDING_MODEL", DEFAULT_MODEL_NAME)
        self.batch_size = max(1, batch_size)
        self._model = None

    @property
    def model(self):
        """The lazily-loaded underlying model."""
        if self._model is None:
            self._model = _load_model(self.model_name)
        return self._model

    @property
    def dimension(self) -> int:
        """Return the embedding vector dimension."""
        try:
            dim = self.model.get_sentence_embedding_dimension()
            return int(dim) if dim else DEFAULT_EMBEDDING_DIM
        except Exception:  # pragma: no cover - defensive fallback
            return DEFAULT_EMBEDDING_DIM

    @staticmethod
    def _sanitize(texts: List[str]) -> List[str]:
        """Clean and truncate texts to respect tokenization limits."""
        sanitized: List[str] = []
        for text in texts:
            cleaned = (text or "").strip()
            if len(cleaned) > _MAX_SEQ_CHARS:
                cleaned = cleaned[:_MAX_SEQ_CHARS]
            # Never feed an empty string to the encoder.
            sanitized.append(cleaned if cleaned else " ")
        return sanitized

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts.

        Args:
            texts: The input texts.

        Returns:
            A list of embedding vectors (list of floats), one per input text.
        """
        if not texts:
            return []

        sanitized = self._sanitize(texts)
        logger.info(
            "Embedding %d text(s) with '%s' (batch_size=%d)",
            len(sanitized),
            self.model_name,
            self.batch_size,
        )
        embeddings = self.model.encode(
            sanitized,
            batch_size=self.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return [vector.tolist() for vector in embeddings]

    def embed_query(self, query: str) -> List[float]:
        """Generate an embedding for a single query string.

        Args:
            query: The query text.

        Returns:
            A single embedding vector.
        """
        result = self.embed([query])
        return result[0] if result else []


def embed_texts(
    texts: List[str],
    model_name: Optional[str] = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> List[List[float]]:
    """Convenience function to embed texts without managing an Embedder.

    Args:
        texts: The input texts.
        model_name: Optional model override.
        batch_size: Batch size for encoding.

    Returns:
        A list of embedding vectors.
    """
    return Embedder(model_name=model_name, batch_size=batch_size).embed(texts)
