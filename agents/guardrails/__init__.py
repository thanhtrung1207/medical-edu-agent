"""Safety guardrails for the Medical Education AI Agent.

This package provides fast, heuristic (non-LLM) guardrails that protect users
from potentially harmful medical misinformation. It exposes four independent
checkers and a :class:`GuardrailRunner` that orchestrates them:

* :class:`HallucinationDetector` - flags claims unsupported by sources.
* :class:`MedicalSafetyChecker` - enforces medical safety rules and detects
  emergencies.
* :class:`ScopeDetector` - detects out-of-scope (non-educational) queries.
* :class:`ConfidenceScorer` - scores response confidence.

Usage::

    from agents.guardrails import GuardrailRunner

    runner = GuardrailRunner()
    pre = runner.run_pre_checks(user_input)
    if pre.should_block:
        return pre.block_reason
    # ... generate response ...
    post = runner.run_post_checks(response, sources, reasoning, user_input)
    if post.should_block:
        return post.block_reason
"""

from .confidence_scorer import ConfidenceScorer
from .hallucination_detector import HallucinationDetector
from .models import (
    DISCLAIMER_VI,
    EMERGENCY_REDIRECT_VI,
    ConfidenceReport,
    GuardrailResult,
    HallucinationReport,
    SafetyReport,
    ScopeReport,
)
from .runner import GuardrailRunner
from .safety_checker import MedicalSafetyChecker
from .scope_detector import ScopeDetector

__all__ = [
    # Constants
    "DISCLAIMER_VI",
    "EMERGENCY_REDIRECT_VI",
    # Components
    "HallucinationDetector",
    "MedicalSafetyChecker",
    "ScopeDetector",
    "ConfidenceScorer",
    "GuardrailRunner",
    # Data models
    "HallucinationReport",
    "SafetyReport",
    "ScopeReport",
    "ConfidenceReport",
    "GuardrailResult",
]
