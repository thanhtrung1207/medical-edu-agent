"""Builds personalized context for agent prompts from memory.

The :class:`ContextBuilder` fuses short-term conversation state (from the
:class:`~memory.session_manager.SessionManager`) with long-term, cross-session
memories (from the :class:`~memory.memory_store.MemoryStore`) into a compact,
Vietnamese context block that the API layer injects into the agent's system
prompt.

Design notes:
    * :meth:`build_prompt_context` is size-bounded (~500 tokens) and prioritizes
      the most relevant/recent memories to protect the model context window.
    * Topic detection uses lightweight Vietnamese keyword analysis (no model
      call), keeping context assembly fast and dependency-free.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Optional

from memory.memory_store import MemoryEntry, MemoryStore
from memory.session_manager import SessionManager

logger = logging.getLogger(__name__)

# Approximate character budget for the injected prompt context.
# Vietnamese averages roughly ~4 chars/token; ~500 tokens => ~2000 chars.
_MAX_CONTEXT_CHARS = 2000

# Long-term learning data must remain a compact part of the prompt.
_MAX_LONG_TERM_MEMORY_CHARS = 1500

# Number of recent messages to surface in the context.
_RECENT_HISTORY_LIMIT = 6

# Vietnamese dental topic keyword map for lightweight topic detection.
# Maps a canonical topic label to trigger keywords (lowercased, no accents-safe
# matching is done on the raw lowercased text).
_TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Răng vỡ": ("răng vỡ", "gãy răng", "răng nứt", "fracture", "cracked tooth", "ellis"),
    "Implant": ("implant", "cắm ghép", "trụ implant", "osseointegration"),
    "Mất răng": ("mất răng", "răng mất", "đơn lẻ", "edentulous", "tooth loss"),
    "Phục hình": ("phục hình", "cầu răng", "mão", "prosthodontics", "fpd", "abutment"),
    "Nha chu": ("nha chu", "nướu", "tiêu xương", "lung lay", "periodontics"),
    "Nội nha": ("nội nha", "tủy", "endodontics", "lấy tủy"),
    "Chỉnh nha": ("chỉnh nha", "orthodontics", "niềng răng"),
    "Phẫu thuật": ("phẫu thuật", "nhổ răng", "răng khôn", "extraction"),
}


class ContextBuilder:
    """Builds rich context for agent interactions using memory."""

    def __init__(
        self, session_manager: SessionManager, memory_store: MemoryStore
    ) -> None:
        """Initialize the builder with its backing stores.

        Args:
            session_manager: Source of session/message history.
            memory_store: Source of long-term user memories.
        """
        self.session_manager = session_manager
        self.memory_store = memory_store

    # ------------------------------------------------------------------ #
    # Structured context
    # ------------------------------------------------------------------ #
    def build_context(
        self,
        user_id: str,
        session_id: str,
        current_topic: str = None,
        clinical_context: str | None = None,
    ) -> dict:
        """Build history plus strict, caller-topic-scoped learning memories.

        A missing topic deliberately suppresses long-term memory. Session
        history remains available even when long-term storage is unavailable.
        """
        history = self.session_manager.get_session_history(
            session_id, limit=_RECENT_HISTORY_LIMIT
        )
        relevant: list[MemoryEntry] = []
        if current_topic:
            try:
                all_memories = self.memory_store.recall_all(user_id)
            except Exception as exc:
                logger.warning("Memory read failed: %s", type(exc).__name__)
                all_memories = {}
            relevant = self._select_relevant_memories(all_memories, current_topic)

        context = {
            "conversation_history": history,
            "user_preferences": {},
            "relevant_memories": relevant,
            "user_profile_summary": "",
        }
        if clinical_context:
            context["clinical_context"] = clinical_context
        logger.debug(
            "Built context for user=%s session=%s topic=%r (%d memories)",
            user_id,
            session_id,
            current_topic,
            len(relevant),
        )
        return context

    # ------------------------------------------------------------------ #
    # Prompt-injection context (size bounded, Vietnamese)
    # ------------------------------------------------------------------ #
    def build_prompt_context(
        self,
        user_id: str,
        session_id: str,
        current_topic: str = None,
    ) -> str:
        """Build a bounded Vietnamese prompt context from structured context."""
        context_data = self.build_context(user_id, session_id, current_topic)
        history_lines = self._format_recent_history(
            context_data["conversation_history"], current_topic
        )
        history_block = ""
        if history_lines:
            history_block = "[Lịch sử gần đây]\n" + "\n".join(history_lines)

        memory_block_budget = _MAX_CONTEXT_CHARS - len(history_block)
        if history_block:
            memory_block_budget -= 2  # Separator between prompt blocks.
        memory_lines = self._format_relevant_memories(
            context_data["relevant_memories"],
            min(_MAX_LONG_TERM_MEMORY_CHARS, max(memory_block_budget, 0)),
        )

        blocks: list[str] = []
        if memory_lines:
            blocks.append("[Dữ liệu học tập]\n" + memory_lines)
        if history_block:
            blocks.append(history_block)

        context = self._enforce_size_budget("\n\n".join(blocks).strip())
        logger.debug(
            "Built prompt context for user=%s (%d chars)", user_id, len(context)
        )
        return context

    # ------------------------------------------------------------------ #
    # Session summarization & topic detection
    # ------------------------------------------------------------------ #
    def summarize_session(self, session_id: str) -> str:
        """Generate a brief summary of a session for memory storage.

        Produces a compact Vietnamese summary capturing the detected topic and
        the first user question. Intended to be persisted as a topic-interest
        or session memory.

        Args:
            session_id: The session identifier.

        Returns:
            A short summary string, or an empty string for unknown/empty
            sessions.
        """
        session = self.session_manager.get_session(session_id)
        if session is None or not session.messages:
            return ""

        topic = session.topic or self.detect_topic_from_messages(session.messages)
        user_msgs = [m for m in session.messages if m.get("role") == "user"]
        first_q = user_msgs[0]["content"].strip() if user_msgs else ""
        first_q = self._truncate(first_q, 120)

        parts = [f"Chủ đề: {topic}"] if topic else []
        if first_q:
            parts.append(f"Câu hỏi đầu: {first_q}")
        parts.append(f"Số tin nhắn: {len(session.messages)}")
        summary = " | ".join(parts)
        logger.debug("Summarized session %s: %s", session_id, summary)
        return summary

    def detect_topic_from_messages(self, messages: list[dict]) -> str:
        """Detect the main topic from messages using keyword analysis.

        Scores each candidate topic by counting keyword occurrences across the
        message contents and returns the highest-scoring label.

        Args:
            messages: List of message dicts with a ``content`` field.

        Returns:
            The detected topic label, or an empty string if none matched.
        """
        if not messages:
            return ""

        text = " ".join(str(m.get("content", "")) for m in messages).lower()
        if not text.strip():
            return ""

        scores: Counter[str] = Counter()
        for topic, keywords in _TOPIC_KEYWORDS.items():
            score = sum(text.count(keyword) for keyword in keywords)
            if score > 0:
                scores[topic] = score

        if not scores:
            return ""
        best_topic, _ = scores.most_common(1)[0]
        logger.debug("Detected topic %r from %d messages", best_topic, len(messages))
        return best_topic

    # ------------------------------------------------------------------ #
    # Internal formatting helpers
    # ------------------------------------------------------------------ #
    def _select_relevant_memories(
        self, all_memories: dict, current_topic: Optional[str]
    ) -> list[MemoryEntry]:
        """Return at most five object-valued memories for one exact topic."""
        if not current_topic:
            return []

        relevant: list[MemoryEntry] = []
        for entries in all_memories.values():
            for entry in entries:
                value = entry.parsed_value()
                if isinstance(value, dict) and value.get("topic") == current_topic:
                    relevant.append(entry)

        relevant.sort(
            key=lambda entry: (entry.confidence, entry.updated_at, entry.id),
            reverse=True,
        )
        return relevant[:5]

    def _format_relevant_memories(
        self,
        memories: list[MemoryEntry],
        max_block_chars: int = _MAX_LONG_TERM_MEMORY_CHARS,
    ) -> str:
        """Serialize complete learning-memory lines within the prompt budget."""
        memory_budget = max(
            0, max_block_chars - len("[Dữ liệu học tập]\n")
        )
        lines: list[str] = []
        for entry in memories:
            line = (
                f"- {entry.memory_type}: "
                f"{json.dumps(entry.parsed_value(), ensure_ascii=False)}"
            )
            line_size = len(line) + (1 if lines else 0)
            if line_size <= memory_budget:
                lines.append(line)
                memory_budget -= line_size
        return "\n".join(lines)

    def _build_profile_summary(self, preferences: dict, all_memories: dict) -> str:
        """Build a short natural-language profile summary for the agent.

        Reuses the ``[Thông tin người dùng]`` formatting so the structured
        context and the prompt context stay consistent.

        Args:
            preferences: User preference mapping.
            all_memories: All memories organized by type.

        Returns:
            A single-line Vietnamese summary, or an empty string.
        """
        lines = self._format_user_info(preferences, all_memories)
        if not lines:
            return ""
        # Strip the leading "- " bullet markers and join into one sentence.
        parts = [line.lstrip("- ").strip() for line in lines]
        return "; ".join(parts)

    def _format_user_info(
        self, preferences: dict, all_memories: dict
    ) -> list[str]:
        """Format the ``[Thông tin người dùng]`` section lines.

        Args:
            preferences: User preference mapping.
            all_memories: All memories organized by type.

        Returns:
            A list of formatted Vietnamese bullet lines.
        """
        lines: list[str] = []

        level = preferences.get("level") or preferences.get("trinh_do")
        if level:
            lines.append(f"- Trình độ: {level}")

        style = preferences.get("explanation_style") or preferences.get(
            "learning_style"
        )
        if style:
            lines.append(f"- Phong cách học: {style}")

        difficulty = preferences.get("difficulty")
        if difficulty:
            lines.append(f"- Mức độ khó ưa thích: {difficulty}")

        interests = self._collect_values(all_memories.get("topic_interest", []))
        if interests:
            lines.append(f"- Chuyên khoa quan tâm: {', '.join(interests[:4])}")

        weak = self._collect_named(all_memories.get("learning_style", []), "weak")
        if weak:
            lines.append(f"- Điểm yếu: {', '.join(weak[:4])}")

        strong = self._collect_named(all_memories.get("learning_style", []), "strong")
        if strong:
            lines.append(f"- Điểm mạnh: {', '.join(strong[:4])}")

        return lines

    def _format_recent_history(
        self, history: list[dict], current_topic: Optional[str]
    ) -> list[str]:
        """Format retained recent turns without reloading session history.

        Args:
            history: Recent message dicts in chronological order.
            current_topic: Detected/assigned topic.

        Returns:
            A list of formatted Vietnamese bullet lines.
        """
        lines: list[str] = []
        if current_topic:
            lines.append(f"- Chủ đề hiện tại: {current_topic}")

        for message in history:
            role = str(message.get("role") or "unknown")
            content = self._truncate(str(message.get("content") or ""), 100)
            lines.append(f"- {role}: {content}")
        return lines

    @staticmethod
    def _collect_values(entries: list[MemoryEntry]) -> list[str]:
        """Extract human-readable values from memory entries."""
        values: list[str] = []
        for entry in entries:
            parsed = entry.parsed_value()
            if isinstance(parsed, dict):
                values.append(str(parsed.get("name") or parsed.get("value") or entry.key))
            else:
                values.append(str(parsed))
        return values

    @staticmethod
    def _collect_named(entries: list[MemoryEntry], marker: str) -> list[str]:
        """Collect learning-style entries flagged as strong/weak areas.

        Args:
            entries: ``learning_style`` memory entries.
            marker: Either ``'weak'`` or ``'strong'``.

        Returns:
            List of area names matching the marker.
        """
        results: list[str] = []
        for entry in entries:
            parsed = entry.parsed_value()
            if isinstance(parsed, dict):
                kind = str(parsed.get("kind", "")).lower()
                if kind == marker:
                    results.append(str(parsed.get("area") or entry.key))
            elif marker in entry.key.lower():
                results.append(str(parsed))
        return results

    @staticmethod
    def _truncate(text: str, max_len: int) -> str:
        """Truncate text to ``max_len`` chars, appending an ellipsis."""
        text = (text or "").strip().replace("\n", " ")
        if len(text) <= max_len:
            return text
        return text[: max_len - 1].rstrip() + "…"

    @staticmethod
    def _enforce_size_budget(
        context: str, max_chars: int = _MAX_CONTEXT_CHARS
    ) -> str:
        """Trim context to ``max_chars`` at line boundaries where possible."""
        if len(context) <= max_chars:
            return context
        truncated = context[:max_chars]
        # Prefer cutting at the last newline to avoid partial lines.
        newline = truncated.rfind("\n")
        if newline > 0:
            truncated = truncated[:newline]
        logger.debug(
            "Trimmed prompt context from %d to %d chars",
            len(context),
            len(truncated),
        )
        return truncated.rstrip()
