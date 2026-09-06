"""Medical reasoning workflow package.

Implements the mandated structured reasoning flow that every agent response
goes through:

    Confirm → Think → Answer → Verify

with a conditional retry edge when the verification confidence is below the
threshold (default 0.7), capped at a maximum number of retries.

Public API:
    * :class:`MedicalReasoningWorkflow` — the orchestrator.
    * ``confirm_node`` / ``think_node`` / ``answer_node`` / ``verify_node`` —
      the individual node callables (async ``state -> state``).
    * ``confirm_agent`` / ``think_agent`` / ``answer_agent`` / ``verify_agent``
      — the underlying ADK agents for each stage.
"""

from __future__ import annotations

from .answer_node import DIFFICULTY_TAGS, answer_agent, answer_node
from .confirm_node import QUESTION_TYPES, confirm_agent, confirm_node
from .graph_workflow import MedicalReasoningWorkflow, WorkflowNode
from .think_node import search_knowledge_base, think_agent, think_node
from .verify_node import CONFIDENCE_THRESHOLD, verify_agent, verify_node

__all__ = [
    # Orchestrator
    "MedicalReasoningWorkflow",
    "WorkflowNode",
    # Node callables
    "confirm_node",
    "think_node",
    "answer_node",
    "verify_node",
    # Node agents
    "confirm_agent",
    "think_agent",
    "answer_agent",
    "verify_agent",
    # Helpers / constants
    "search_knowledge_base",
    "QUESTION_TYPES",
    "DIFFICULTY_TAGS",
    "CONFIDENCE_THRESHOLD",
]
