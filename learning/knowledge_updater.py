"""Knowledge base update tracking for the self-learning module.

Records additions, corrections and removals applied to the knowledge base and
produces human-readable changelogs for auditability.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from .models import KnowledgeUpdate, LearningDatabase

logger = logging.getLogger(__name__)

# Recognized update types.
_TYPE_ADDITION = "addition"
_TYPE_CORRECTION = "correction"
_TYPE_REMOVAL = "removal"


class KnowledgeUpdater:
    """Updates the knowledge base based on new information."""

    def __init__(self, db: LearningDatabase) -> None:
        """Initialize with a shared :class:`LearningDatabase` instance."""
        self.db = db

    def record_correction(
        self, source: str, content: str, applied_by: str = "user"
    ) -> KnowledgeUpdate:
        """Record a knowledge correction from user/expert feedback.

        Args:
            source: Originating document or reference.
            content: Description of the correction.
            applied_by: One of 'user', 'auto', 'expert'.

        Returns:
            The persisted :class:`KnowledgeUpdate`.
        """
        return self._record(_TYPE_CORRECTION, source, content, applied_by)

    def record_addition(
        self, source: str, content: str, applied_by: str = "auto"
    ) -> KnowledgeUpdate:
        """Record new knowledge added to the system.

        Args:
            source: Originating document or reference.
            content: Description of the added knowledge.
            applied_by: One of 'user', 'auto', 'expert'.

        Returns:
            The persisted :class:`KnowledgeUpdate`.
        """
        return self._record(_TYPE_ADDITION, source, content, applied_by)

    def record_removal(
        self, source: str, content: str, applied_by: str = "expert"
    ) -> KnowledgeUpdate:
        """Record knowledge removed from the system.

        Args:
            source: Originating document or reference.
            content: Description of the removed knowledge.
            applied_by: One of 'user', 'auto', 'expert'.

        Returns:
            The persisted :class:`KnowledgeUpdate`.
        """
        return self._record(_TYPE_REMOVAL, source, content, applied_by)

    def _record(
        self, update_type: str, source: str, content: str, applied_by: str
    ) -> KnowledgeUpdate:
        """Persist a knowledge update of the given type."""
        update = KnowledgeUpdate(
            id=None,
            source_document=source,
            update_type=update_type,
            content=content,
            applied_at=datetime.utcnow(),
            applied_by=applied_by,
        )
        stored = self.db.insert_knowledge_update(update)
        logger.info(
            "Recorded knowledge %s id=%s from %s by %s",
            update_type,
            stored.id,
            source,
            applied_by,
        )
        return stored

    def get_recent_updates(self, days: int = 30) -> List[KnowledgeUpdate]:
        """Get recent knowledge updates for a changelog.

        Args:
            days: Look-back window in days.

        Returns:
            Knowledge updates applied within the window (newest first).
        """
        since = datetime.utcnow() - timedelta(days=max(0, days))
        return self.db.get_knowledge_updates_since(since)

    def get_corrections_for_topic(self, topic: str) -> List[KnowledgeUpdate]:
        """Get all corrections related to a topic.

        Matching is a case-insensitive substring search over the correction
        content and source document.

        Args:
            topic: Topic keyword to filter by.

        Returns:
            Matching correction updates (newest first).
        """
        topic_lc = (topic or "").strip().lower()
        corrections = self.db.get_knowledge_updates_by_type(_TYPE_CORRECTION)
        if not topic_lc:
            return corrections
        return [
            u
            for u in corrections
            if topic_lc in u.content.lower()
            or topic_lc in u.source_document.lower()
        ]

    def generate_changelog(self, since: Optional[datetime] = None) -> str:
        """Generate a human-readable changelog of knowledge updates.

        Args:
            since: Only include updates applied on/after this time. When None,
                all updates are included.

        Returns:
            A Markdown-formatted changelog string grouped by update type.
        """
        updates = self.db.get_knowledge_updates_since(since)
        if not updates:
            return "# Knowledge Changelog\n\n_No updates recorded._"

        grouped = {
            _TYPE_ADDITION: [],
            _TYPE_CORRECTION: [],
            _TYPE_REMOVAL: [],
        }
        for u in updates:
            grouped.setdefault(u.update_type, []).append(u)

        titles = {
            _TYPE_ADDITION: "Additions",
            _TYPE_CORRECTION: "Corrections",
            _TYPE_REMOVAL: "Removals",
        }

        lines: List[str] = ["# Knowledge Changelog", ""]
        for update_type, section_title in titles.items():
            entries = grouped.get(update_type) or []
            if not entries:
                continue
            lines.append(f"## {section_title} ({len(entries)})")
            lines.append("")
            for entry in entries:
                stamp = (
                    entry.applied_at.strftime("%Y-%m-%d")
                    if entry.applied_at
                    else "unknown date"
                )
                lines.append(
                    f"- **{stamp}** ({entry.applied_by}) "
                    f"[{entry.source_document}]: {entry.content}"
                )
            lines.append("")

        return "\n".join(lines).rstrip() + "\n"
