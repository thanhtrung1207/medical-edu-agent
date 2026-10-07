"""Centralized LLM provider selection with Gemini fallback."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
_PRIMARY_PROVIDER = os.getenv("PRIMARY_PROVIDER", "claude").lower()
_GATEWAY_BASE_URL = os.getenv("GATEWAY_BASE_URL", "").rstrip("/")
_GATEWAY_MODEL = os.getenv("GATEWAY_MODEL", "")


def _claude_available() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def _gateway_available() -> bool:
    return bool(
        _GATEWAY_BASE_URL
        and _GATEWAY_MODEL
        and os.getenv("GATEWAY_API_KEY")
    )


def _gateway_model():
    from google.adk.models.lite_llm import LiteLlm

    return LiteLlm(
        model=f"openai/{_GATEWAY_MODEL}",
        api_base=_GATEWAY_BASE_URL,
        api_key=os.environ["GATEWAY_API_KEY"],
    )


def get_primary_model():
    """Return the configured primary model or the Gemini fallback."""
    if _PRIMARY_PROVIDER == "claude" and _claude_available():
        try:
            from google.adk.models.lite_llm import LiteLlm

            logger.info("Primary LLM: Claude (%s) via LiteLLM", _CLAUDE_MODEL)
            return LiteLlm(model=f"anthropic/{_CLAUDE_MODEL}")
        except Exception:
            logger.warning("Failed to initialize Claude LiteLLM; using Gemini fallback.")
    elif _PRIMARY_PROVIDER == "gateway" and _gateway_available():
        try:
            logger.info("Primary LLM: gateway model %s via LiteLLM", _GATEWAY_MODEL)
            return _gateway_model()
        except Exception:
            logger.warning("Failed to initialize gateway LiteLLM; using Gemini fallback.")
    elif _PRIMARY_PROVIDER == "gateway":
        logger.warning("Gateway configuration is incomplete; using Gemini fallback.")

    logger.info("Primary LLM: Gemini (%s)", _GEMINI_MODEL)
    return _GEMINI_MODEL


def get_fallback_model() -> str:
    """Return the Gemini fallback model."""
    return _GEMINI_MODEL


def has_distinct_fallback() -> bool:
    """Return whether the selected primary differs from Gemini."""
    return not isinstance(get_primary_model(), str)
