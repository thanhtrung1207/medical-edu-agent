"""Conservative extraction of explicit, topic-scoped learning facts."""

from __future__ import annotations

from dataclasses import dataclass

TOPICS = frozenset(
    {
        "Răng vỡ",
        "Mất răng",
        "Phục hình",
        "Implant",
        "Nha chu",
        "Nội nha",
        "Chỉnh nha",
        "Phẫu thuật",
    }
)


@dataclass(frozen=True)
class LearningFact:
    """A compact learning fact safe for long-term storage."""

    memory_type: str
    key: str
    value: dict[str, str]
    confidence: float


def normalize_topic(topic: str) -> str:
    """Return a canonical dental topic, or an empty string when unknown."""
    normalized = topic.strip()
    return normalized if normalized in TOPICS else ""


def extract_explicit_learning_facts(message: str, topic: str) -> list[LearningFact]:
    """Extract only explicit goals or explanation-style preferences."""
    normalized_topic = normalize_topic(topic)
    normalized_message = message.strip()
    if not normalized_topic or not normalized_message:
        return []

    lower = normalized_message.lower()
    if lower.startswith(("tôi muốn học", "mục tiêu của tôi", "tôi đang ôn")):
        return [
            LearningFact(
                memory_type="learning_goal",
                key=f"goal:{normalized_topic}",
                value={
                    "topic": normalized_topic,
                    "summary": f"Mục tiêu học {normalized_topic}",
                },
                confidence=1.0,
            )
        ]

    for style in ("ngắn gọn", "chi tiết", "từng bước"):
        if lower.startswith("hãy giải thích") and style in lower:
            return [
                LearningFact(
                    memory_type="preference",
                    key=f"preference:{normalized_topic}:explanation_style",
                    value={
                        "topic": normalized_topic,
                        "name": "explanation_style",
                        "summary": style,
                    },
                    confidence=1.0,
                )
            ]

    return []
