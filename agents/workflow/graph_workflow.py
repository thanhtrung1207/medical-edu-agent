"""Graph workflow orchestrator for the medical reasoning flow.

This module defines :class:`MedicalReasoningWorkflow`, the practical orchestrator
that wires the four reasoning nodes into the mandated flow:

    confirm → think → answer → verify

with a conditional retry edge: if the Verify node reports a confidence score
below :data:`~agents.workflow.verify_node.CONFIDENCE_THRESHOLD` (default 0.7),
the workflow retries from the Confirm node. A hard cap of ``max_retries`` (2)
prevents infinite loops.

Because Google ADK 2.0's exact Graph API may vary between releases, the flow is
implemented as an explicit Python orchestrator. Each node is an ``async``
callable that accepts a state ``dict`` and returns an updated state ``dict``.
"""

from __future__ import annotations

from typing import Awaitable, Callable, Dict, List, Optional

from .answer_node import answer_node
from .confirm_node import confirm_node
from .think_node import think_node
from .verify_node import CONFIDENCE_THRESHOLD, verify_node

__all__ = ["MedicalReasoningWorkflow", "WorkflowNode"]

# Type alias for a workflow node: an async callable state -> state.
WorkflowNode = Callable[[Dict], Awaitable[Dict]]


class MedicalReasoningWorkflow:
    """Orchestrates the Confirm → Think → Answer → Verify reasoning flow.

    The workflow executes the four nodes in sequence. After the Verify node it
    inspects ``confidence_score``: if it is below ``confidence_threshold`` and
    retries remain, the whole sequence is re-executed (a conditional edge back
    to Confirm). Otherwise the verified answer is returned.

    Attributes:
        max_retries: Maximum number of *additional* attempts after the first
            pass (total attempts = ``max_retries + 1``).
        confidence_threshold: Minimum ``confidence_score`` required to accept an
            answer without retrying.
    """

    def __init__(
        self,
        max_retries: int = 0,
        confidence_threshold: float = CONFIDENCE_THRESHOLD,
    ) -> None:
        """Initialise the workflow.

        Args:
            max_retries: Maximum number of retries (default 2).
            confidence_threshold: Acceptance threshold for ``confidence_score``.
        """
        self.max_retries = max_retries
        self.confidence_threshold = confidence_threshold
        # The graph edges, declared explicitly for clarity / introspection.
        self._nodes: List[tuple[str, WorkflowNode]] = [
            ("confirm", confirm_node),
            ("think", think_node),
            ("answer", answer_node),
            ("verify", verify_node),
        ]

    # -- Individual node wrappers (kept for readability / external use) -----

    async def confirm(self, state: Dict) -> Dict:
        """Run the Confirm node."""
        return await confirm_node(state)

    async def think(self, state: Dict) -> Dict:
        """Run the Think node."""
        return await think_node(state)

    async def answer(self, state: Dict) -> Dict:
        """Run the Answer node."""
        return await answer_node(state)

    async def verify(self, state: Dict) -> Dict:
        """Run the Verify node."""
        return await verify_node(state)

    # -- Orchestration ------------------------------------------------------

    async def run(self, user_input: str, context: Optional[Dict] = None) -> Dict:
        """Execute the full reasoning workflow.

        Args:
            user_input: The raw user question.
            context: Optional additional context (e.g. session metadata).

        Returns:
            The final workflow state dict. Key fields include
            ``verified_answer``, ``confidence_score``, ``warnings``,
            ``attempts`` and ``accepted``.
        """
        state: Dict = {"user_input": user_input, "context": context or {}}

        accepted = False
        attempts = 0
        for attempt in range(self.max_retries + 1):
            attempts = attempt + 1
            state["attempt"] = attempts

            # confirm → think → answer → verify
            state = await self.confirm(state)
            state = await self.think(state)
            state = await self.answer(state)
            state = await self.verify(state)

            if state.get("confidence_score", 0.0) >= self.confidence_threshold:
                accepted = True
                break

        state["attempts"] = attempts
        state["accepted"] = accepted
        # When never accepted, surface the low-confidence result with a warning.
        if not accepted:
            warnings = state.setdefault("warnings", [])
            warnings.append(
                "Đã đạt số lần thử tối đa nhưng độ tin cậy vẫn dưới ngưỡng "
                f"{self.confidence_threshold}. Câu trả lời cần được chuyên gia "
                "rà soát."
            )
        return state
