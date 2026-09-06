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

import logging
from collections import Counter
from typing import Optional

from memory.memory_store import MemoryEntry, MemoryStore
from memory.session_manager import SessionManager

logger = logging.getLogger(__name__)

# Approximate character budget for the injected prompt context.
# Vietnamese averages roughly ~4 chars/token; ~500 tokens => ~2000 chars.
_MAX_CONTEXT_CHARS = 2000

# Number of recent messages to surface in the context.
_RECENT_HISTORY_LIMIT = 6

# Vietnamese dental topic keyword map for lightweight topic detection.
# Maps a canonical topic label to trigger keywords (lowercased, no accents-safe
# matching is done on the raw lowercased text).
_TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Răng vỡ": ("răng vỡ", "gãy răng", "răng nứt", "fracture", "cracked tooth", "ellis"),
    "Mất răng": ("mất răng", "răng mất", "đơn lẻ", "edentulous", "tooth loss"),
    "Phục hình": ("phục hình", "cầu răng", "mão", "prosthodontics", "fpd", "abutment"),
    "Implant": ("implant", "cắm ghép", "trụ implant", "osseointegration"),
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
    ) -> dict:
        """Build comprehensive structured context for the agent.

        Assembles recent conversation history, user preferences, relevant
        long-term memories (topic interests, weak areas, bookmarks) and a
        short natural-language profile summary.

        Args:
            user_id: Owning user identifier.
            session_id: The active session identifier.
            current_topic: Optional topic to bias relevance. If omitted, it is
                inferred from recent messages.

        Returns:
            A dict with keys:
                * ``conversation_history``: list of recent message dicts.
                * ``user_preferences``: dict of preferences.
                * ``relevant_memories``: list of relevant :class:`MemoryEntry`.
                * ``user_profile_summary``: str summary for prompt injection.
        """
        history = self.session_manager.get_session_history(
            session_id, limit=_RECENT_HISTORY_LIMIT
        )

        if not current_topic:
            current_topic = self.detect_topic_from_messages(history)

        preferences = self.memory_store.get_user_preferences(user_id)
        all_memories = self.memory_store.recall_all(user_id)
        relevant = self._select_relevant_memories(all_memories, current_topic)

        summary = self._build_profile_summary(preferences, all_memories)

        context = {
            "conversation_history": history,
            "user_preferences": preferences,
            "relevant_memories": relevant,
            "user_profile_summary": summary,
        }
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
        """Build a formatted Vietnamese string to inject into agent prompts.

        The output is bounded to roughly 500 tokens; less relevant content is
        trimmed first. Returns an empty string if no useful context exists.

        Args:
            user_id: Owning user identifier.
            session_id: The active session identifier.
            current_topic: Optional topic override for relevance biasing.

        Returns:
            A formatted context string, possibly empty.
        """
        history = self.session_manager.get_session_history(
            session_id, limit=_RECENT_HISTORY_LIMIT
        )
        if not current_topic:
            current_topic = self.detect_topic_from_messages(history)

        preferences = self.memory_store.get_user_preferences(user_id)
        all_memories = self.memory_store.recall_all(user_id)

        user_lines = self._format_user_info(preferences, all_memories)
        history_lines = self._format_recent_history(
            history, session_id, current_topic
        )

        blocks: list[str] = []
        if user_lines:
            blocks.append("[Thông tin người dùng]\n" + "\n".join(user_lines))
        if history_lines:
            blocks.append("[Lịch sử gần đây]\n" + "\n".join(history_lines))

        context = "\n\n".join(blocks).strip()
        context = self._enforce_size_budget(context)
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
        """Flatten and rank memories by relevance to the current topic.

        Args:
            all_memories: Mapping of type to :class:`MemoryEntry` lists.
            current_topic: Topic used to boost relevance, if any.

        Returns:
            Memories sorted by relevance score (desc).
        """
        flat: list[MemoryEntry] = []
        for entries in all_memories.values():
            flat.extend(entries)

        topic_lc = (current_topic or "").lower()

        def relevance(entry: MemoryEntry) -> float:
            score = entry.confidence
            if topic_lc:
                haystack = f"{entry.key} {entry.value}".lower()
                if topic_lc in haystack:
                    score += 1.0
            # Slightly favor frequently used memories.
            score += min(entry.access_count, 10) * 0.01
            return score

        flat.sort(key=relevance, reverse=True)
        return flat

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
        self, history: list[dict], session_id: str, current_topic: Optional[str]
    ) -> list[str]:
        """Format the ``[Lịch sử gần đây]`` section lines.

        Args:
            history: Recent message dicts.
            session_id: The active session identifier.
            current_topic: Detected/assigned topic.

        Returns:
            A list of formatted Vietnamese bullet lines.
        """
        lines: list[str] = []

        session = self.session_manager.get_session(session_id)
        prev_topic = session.topic if session else None
        if prev_topic:
            lines.append(f"- Chủ đề trước: {prev_topic}")
        elif current_topic:
            lines.append(f"- Chủ đề hiện tại: {current_topic}")

        last_user = None
        for msg in reversed(history):
            if msg.get("role") == "user":
                last_user = msg
                break
        if last_user:
            lines.append(
                f"- Câu hỏi gần nhất: {self._truncate(last_user['content'], 100)}"
            )
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
    def _enforce_size_budget(context: str) -> str:
        """Trim the context to the configured character budget.

        Trimming is done at line boundaries where possible so the output stays
        well-formed.

        Args:
            context: The assembled context string.

        Returns:
            A context string within ``_MAX_CONTEXT_CHARS``.
        """
        if len(context) <= _MAX_CONTEXT_CHARS:
            return context
        truncated = context[:_MAX_CONTEXT_CHARS]
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
