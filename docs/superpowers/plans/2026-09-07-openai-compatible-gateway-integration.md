# OpenAI-Compatible Gateway Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure an OpenAI-compatible gateway as an optional primary ADK/LiteLLM provider while preserving Gemini as the fallback and keeping credentials local-only.

**Architecture:** Extend the centralized provider factory in `agents/model_config.py` with a `gateway` branch that creates LiteLLM with an OpenAI-compatible model identifier, explicit base URL, and key. The existing `run_agent()` logic already retries a distinct LiteLLM primary with Gemini, so no workflow node changes are required. Configuration remains environment-only; model catalog discovery is a deliberate manual operation after key rotation.

**Tech Stack:** Python 3.12, Google ADK, LiteLLM, pytest, FastAPI application configuration.

---

## File Structure

- Modify: `agents/model_config.py` — add secure gateway configuration, availability validation, and LiteLLM construction.
- Modify: `.env.example` — document gateway environment variables using non-secret placeholders.
- Create: `tests/test_model_config.py` — isolate provider selection with environment and LiteLLM-constructor monkeypatches; never call the network.

### Task 1: Define provider-selection regressions

**Files:**
- Create: `tests/test_model_config.py`
- Modify: none

- [ ] **Step 1: Create the test module with isolated configuration loading**

```python
"""Unit tests for environment-based LLM provider selection."""

from __future__ import annotations

import importlib

import pytest

pytest.importorskip("google.adk")

import google.adk.models.lite_llm as lite_llm  # noqa: E402


_CONFIG_VARIABLES = (
    "PRIMARY_PROVIDER",
    "CLAUDE_MODEL",
    "ANTHROPIC_API_KEY",
    "GEMINI_MODEL",
    "GATEWAY_BASE_URL",
    "GATEWAY_API_KEY",
    "GATEWAY_MODEL",
)


def _load_model_config(monkeypatch, **environment):
    for name in _CONFIG_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    for name, value in environment.items():
        monkeypatch.setenv(name, value)

    import agents.model_config as model_config

    return importlib.reload(model_config)


def test_gateway_primary_uses_openai_compatible_litellm(monkeypatch):
    class FakeLiteLlm:
        def __init__(self, model, api_base=None, api_key=None):
            self.model = model
            self.api_base = api_base
            self.api_key = api_key

    monkeypatch.setattr(lite_llm, "LiteLlm", FakeLiteLlm)
    config = _load_model_config(
        monkeypatch,
        PRIMARY_PROVIDER="gateway",
        GATEWAY_BASE_URL="https://gateway.example/v1/",
        GATEWAY_API_KEY="rotated-local-key",
        GATEWAY_MODEL="catalog-model-id",
        GEMINI_MODEL="gemini-test-fallback",
    )

    primary = config.get_primary_model()

    assert isinstance(primary, FakeLiteLlm)
    assert primary.model == "openai/catalog-model-id"
    assert primary.api_base == "https://gateway.example/v1"
    assert primary.api_key == "rotated-local-key"
    assert config.get_fallback_model() == "gemini-test-fallback"
    assert config.has_distinct_fallback()


@pytest.mark.parametrize(
    "missing_variable",
    ("GATEWAY_BASE_URL", "GATEWAY_API_KEY", "GATEWAY_MODEL"),
)
def test_incomplete_gateway_configuration_uses_gemini(monkeypatch, missing_variable):
    environment = {
        "PRIMARY_PROVIDER": "gateway",
        "GATEWAY_BASE_URL": "https://gateway.example/v1",
        "GATEWAY_API_KEY": "rotated-local-key",
        "GATEWAY_MODEL": "catalog-model-id",
        "GEMINI_MODEL": "gemini-test-fallback",
    }
    environment.pop(missing_variable)
    config = _load_model_config(monkeypatch, **environment)

    assert config.get_primary_model() == "gemini-test-fallback"
    assert not config.has_distinct_fallback()


def test_gateway_initialization_failure_hides_api_key(monkeypatch, caplog):
    def raise_with_secret(*_args, **_kwargs):
        raise RuntimeError("rotated-local-key must never be logged")

    monkeypatch.setattr(lite_llm, "LiteLlm", raise_with_secret)
    config = _load_model_config(
        monkeypatch,
        PRIMARY_PROVIDER="gateway",
        GATEWAY_BASE_URL="https://gateway.example/v1",
        GATEWAY_API_KEY="rotated-local-key",
        GATEWAY_MODEL="catalog-model-id",
        GEMINI_MODEL="gemini-test-fallback",
    )

    assert config.get_primary_model() == "gemini-test-fallback"
    assert "rotated-local-key" not in caplog.text


def test_claude_and_gemini_selection_remain_unchanged(monkeypatch):
    class FakeLiteLlm:
        def __init__(self, model, **_kwargs):
            self.model = model

    monkeypatch.setattr(lite_llm, "LiteLlm", FakeLiteLlm)
    claude = _load_model_config(
        monkeypatch,
        PRIMARY_PROVIDER="claude",
        ANTHROPIC_API_KEY="anthropic-local-key",
        CLAUDE_MODEL="claude-test-model",
        GEMINI_MODEL="gemini-test-fallback",
    )
    gemini = _load_model_config(
        monkeypatch,
        PRIMARY_PROVIDER="gemini",
        GEMINI_MODEL="gemini-test-fallback",
    )

    assert claude.get_primary_model().model == "anthropic/claude-test-model"
    assert claude.get_fallback_model() == "gemini-test-fallback"
    assert gemini.get_primary_model() == "gemini-test-fallback"
    assert not gemini.has_distinct_fallback()
```

- [ ] **Step 2: Run the new gateway-primary regression and verify the expected red state**

Run:

```bash
venv/bin/python -m pytest tests/test_model_config.py::test_gateway_primary_uses_openai_compatible_litellm -q
```

Expected: FAIL because `PRIMARY_PROVIDER=gateway` currently returns the Gemini string instead of a LiteLLM client.

### Task 2: Add the secure gateway provider branch

**Files:**
- Modify: `agents/model_config.py`
- Test: `tests/test_model_config.py`

- [ ] **Step 1: Replace `agents/model_config.py` with the provider factory below**

```python
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
```

- [ ] **Step 2: Run the new model-configuration suite**

Run:

```bash
venv/bin/python -m pytest tests/test_model_config.py -q
```

Expected: PASS. No network traffic occurs because LiteLLM is monkeypatched.

- [ ] **Step 3: Run the existing workflow configuration tests to confirm the fallback contract remains compatible**

Run:

```bash
venv/bin/python -m pytest tests/test_workflow.py -q
```

Expected: PASS.

### Task 3: Document local gateway configuration

**Files:**
- Modify: `.env.example`
- Test: `tests/test_model_config.py`

- [ ] **Step 1: Replace the provider configuration section in `.env.example`**

```dotenv
# LLM provider config — gateway, Claude, or Gemini primary; Gemini fallback
PRIMARY_PROVIDER=claude
CLAUDE_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# OpenAI-compatible gateway; keep the real key only in local .env
GATEWAY_BASE_URL=https://gateway.example/v1
GATEWAY_API_KEY=your_gateway_api_key_here
GATEWAY_MODEL=provider_model_id
```

Keep the remaining application, vector database, and session settings unchanged.

- [ ] **Step 2: Add a placeholder-only documentation assertion**

Append this test to `tests/test_model_config.py`:

```python
def test_gateway_environment_example_contains_no_live_key():
    example = (
        __import__("pathlib").Path(__file__).parents[1] / ".env.example"
    ).read_text()

    assert "GATEWAY_BASE_URL=https://gateway.example/v1" in example
    assert "GATEWAY_API_KEY=your_gateway_api_key_here" in example
    assert "GATEWAY_MODEL=provider_model_id" in example
    assert "sk-" not in example
```

- [ ] **Step 3: Run the complete provider test suite**

Run:

```bash
venv/bin/python -m pytest tests/test_model_config.py -q
```

Expected: PASS without a live gateway API key.

### Task 4: Perform controlled manual gateway verification

**Files:**
- Modify: none
- Test: live `/api/chat` request after local configuration

- [ ] **Step 1: Rotate the API key that was exposed in chat**

Revoke the exposed key in the gateway provider console and create a replacement. Do not paste the replacement into chat, shell history, source files, or test fixtures.

- [ ] **Step 2: Configure the rotated key locally**

In the ignored local `.env`, set the selected catalog model ID after a manual authenticated `GET /models` performed outside captured logs:

```dotenv
PRIMARY_PROVIDER=gateway
GATEWAY_BASE_URL=https://gateway.agents.ai.vn/v1
GATEWAY_API_KEY=<rotated-local-secret>
GATEWAY_MODEL=<catalog-model-id>
GEMINI_MODEL=gemini-2.5-flash
```

- [ ] **Step 3: Start the backend and observe provider selection**

Run:

```bash
venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

Expected: startup logs identify the gateway model ID but never contain the API key.

- [ ] **Step 4: Submit one educational request through the public API surface**

Run from a second terminal:

```bash
curl --fail-with-body -sS http://127.0.0.1:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Ferrule là gì trong phục hồi răng?","user_id":"gateway-smoke-test"}'
```

Expected: HTTP 200 structured chat response. If the gateway cannot initialize or respond, the application uses Gemini fallback without exposing the gateway key.

- [ ] **Step 5: Probe incomplete gateway configuration**

Temporarily remove only `GATEWAY_MODEL` from local `.env`, restart the backend, and repeat the request.

Expected: HTTP 200 via Gemini fallback; logs state that gateway configuration is incomplete and contain no gateway secret.

- [ ] **Step 6: Restore the selected gateway model setting and stop the local backend**

Restore `GATEWAY_MODEL=<catalog-model-id>` in local `.env`, then stop the test process. Do not commit `.env`.

## Plan Self-Review

- [x] **Spec coverage:** Task 2 implements provider selection, validation, URL normalization, sanitized initialization failure, Gemini fallback, and unchanged Claude behavior. Task 3 documents placeholders only. Task 4 covers post-rotation catalog selection and the real API surface without automatic discovery.
- [x] **Security scope:** No step stores a real key in source, tests, documentation, or logs. No gateway call is automatic.
- [x] **Scope control:** The plan does not route individual workflow nodes to separate models, modify safety guardrails, replace Gemini fallback, or alter canonical-index work.
- [x] **Type consistency:** `get_primary_model()` returns either a LiteLLM client or Gemini string; `has_distinct_fallback()` retains the existing string/non-string contract used by `run_agent()`.
