"""Centralized LLM model configuration: Claude primary, Gemini fallback."""
from __future__ import annotations

import logging
import os
from typing import Union

logger = logging.getLogger(__name__)

# Config from environment (with sensible defaults)
_CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
_PRIMARY_PROVIDER = os.getenv("PRIMARY_PROVIDER", "claude").lower()


def _claude_available() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def get_primary_model():
    """Return the primary model object/string.

    Claude (via LiteLlm) if ANTHROPIC_API_KEY is set and provider is claude;
    otherwise fall back to the Gemini string.
    """
    if _PRIMARY_PROVIDER == "claude" and _claude_available():
        try:
            from google.adk.models.lite_llm import LiteLlm
            logger.info("Primary LLM: Claude (%s) via LiteLlm", _CLAUDE_MODEL)
            return LiteLlm(model=f"anthropic/{_CLAUDE_MODEL}")
        except Exception as exc:
            logger.warning("Failed to init Claude LiteLlm, using Gemini: %s", exc)
    logger.info("Primary LLM: Gemini (%s)", _GEMINI_MODEL)
    return _GEMINI_MODEL


def get_fallback_model() -> str:
    """Return the fallback model string (always Gemini)."""
    return _GEMINI_MODEL


def has_distinct_fallback() -> bool:
    """True when the primary model differs from the Gemini fallback."""
    primary = get_primary_model()
    # Primary is a LiteLlm object (Claude) => distinct fallback exists
    return not isinstance(primary, str)
