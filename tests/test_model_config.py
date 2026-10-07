"""Unit tests for environment-based LLM provider selection."""

from __future__ import annotations

import importlib.util
from pathlib import Path

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


def _load_model_config(monkeypatch: pytest.MonkeyPatch, **environment: str):
    for name in _CONFIG_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    for name, value in environment.items():
        monkeypatch.setenv(name, value)

    path = Path(__file__).parents[1] / "agents" / "model_config.py"
    spec = importlib.util.spec_from_file_location("model_config_under_test", path)
    assert spec and spec.loader
    model_config = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(model_config)
    return model_config


def test_gateway_primary_uses_openai_compatible_litellm(monkeypatch: pytest.MonkeyPatch):
    class FakeLiteLlm:
        def __init__(self, model: str, api_base: str | None = None, api_key: str | None = None):
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
def test_incomplete_gateway_configuration_uses_gemini(
    monkeypatch: pytest.MonkeyPatch,
    missing_variable: str,
):
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


def test_gateway_initialization_failure_does_not_log_secret(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    class BrokenLiteLlm:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("provider rejected credentials")

    monkeypatch.setattr(lite_llm, "LiteLlm", BrokenLiteLlm)
    config = _load_model_config(
        monkeypatch,
        PRIMARY_PROVIDER="gateway",
        GATEWAY_BASE_URL="https://gateway.example/v1",
        GATEWAY_API_KEY="rotated-local-secret",
        GATEWAY_MODEL="catalog-model-id",
        GEMINI_MODEL="gemini-test-fallback",
    )

    assert config.get_primary_model() == "gemini-test-fallback"
    assert "rotated-local-secret" not in caplog.text


def test_gateway_environment_example_contains_no_live_key():
    example = (Path(__file__).parents[1] / ".env.example").read_text()

    assert "GATEWAY_BASE_URL=https://gateway.example/v1" in example
    assert "GATEWAY_API_KEY=your_gateway_api_key_here" in example
    assert "GATEWAY_MODEL=provider_model_id" in example
    assert "sk-" not in example
