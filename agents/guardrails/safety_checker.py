"""Medical safety checking for agent responses.

Ensures responses comply with medical safety rules, detects medical
emergencies (which must be redirected to emergency services), and detects when
a user appears to be seeking real medical help rather than studying. Uses fast
keyword/heuristic matching (no LLM call).
"""

from __future__ import annotations

import logging

from ._text import find_keywords, normalize
from .models import DISCLAIMER_VI, EMERGENCY_REDIRECT_VI, SafetyReport

logger = logging.getLogger(__name__)


class MedicalSafetyChecker:
    """Ensures responses comply with medical safety rules."""

    SAFETY_RULES = [
        "KHÔNG chẩn đoán bệnh thật cho bệnh nhân",
        "KHÔNG kê đơn thuốc cụ thể cho bệnh nhân thật",
        "KHÔNG thay thế lời khuyên của bác sĩ",
        "KHÔNG khuyến khích tự điều trị",
        "KHÔNG cung cấp liều thuốc cụ thể cho case thật",
    ]

    EMERGENCY_KEYWORDS = [
        "tự tử", "suicide", "muốn chết", "đau ngực dữ dội",
        "khó thở cấp", "chảy máu không cầm", "co giật",
        "bất tỉnh", "sốc phản vệ",
    ]

    # Phrases in the USER INPUT that indicate the user is asking for real,
    # personal medical help rather than studying medicine.
    _PERSONAL_HELP_KEYWORDS = [
        "tôi bị", "tôi đang bị", "em bị", "con tôi bị", "mẹ tôi bị",
        "bố tôi bị", "người nhà tôi", "tôi có triệu chứng", "tôi cảm thấy",
        "tôi nên uống thuốc gì", "tôi nên dùng thuốc gì", "tôi phải làm gì",
        "chẩn đoán giúp tôi", "kê đơn cho tôi", "tôi có bị", "liệu tôi có",
        "i have symptoms", "should i take", "diagnose me", "what should i do",
        "prescribe me", "am i having",
    ]

    # Phrases in the RESPONSE that suggest the agent is prescribing/diagnosing
    # for a real person (a safety-rule violation).
    _PRESCRIPTION_PHRASES = [
        "bạn nên uống", "bạn hãy uống", "bạn nên dùng thuốc", "tôi kê cho bạn",
        "hãy dùng liều", "uống mỗi ngày", "bạn bị bệnh", "bạn đã mắc",
        "bạn cần uống", "you should take", "i prescribe", "take this dose",
    ]

    # Phrases in the RESPONSE encouraging self-treatment.
    _SELF_TREATMENT_PHRASES = [
        "tự điều trị", "tự chữa", "không cần đi khám", "không cần bác sĩ",
        "khỏi cần gặp bác sĩ", "tự mua thuốc", "self-medicate",
        "no need to see a doctor",
    ]

    def check(self, response: str, user_input: str) -> SafetyReport:
        """Check the response and input against medical safety rules.

        Steps:
            1. Check if the response violates any safety rules.
            2. Detect if the user is seeking real medical help (not studying).
            3. Check for emergency keywords -> redirect to emergency services.
            4. Add an appropriate disclaimer.

        Args:
            response: The agent's generated response text.
            user_input: The original user query.

        Returns:
            A :class:`SafetyReport` describing safety status, violations,
            emergency state, disclaimer, and any redirect message.
        """
        violations: list[str] = []
        redirect_message: str | None = None

        # 1. Emergency detection (highest priority).
        emergency_hits = find_keywords(user_input, self.EMERGENCY_KEYWORDS)
        is_emergency = bool(emergency_hits)
        if is_emergency:
            redirect_message = EMERGENCY_REDIRECT_VI
            logger.warning(
                "Emergency keywords detected in user input: %s", emergency_hits
            )

        # 2. Detect user seeking real personal medical help.
        seeking_real_help = bool(
            find_keywords(user_input, self._PERSONAL_HELP_KEYWORDS)
        )
        if seeking_real_help:
            violations.append(
                "Người dùng có thể đang tìm kiếm lời khuyên y tế cá nhân thật "
                "sự thay vì mục đích học tập."
            )

        # 3. Response-level rule violations.
        if find_keywords(response, self._PRESCRIPTION_PHRASES):
            violations.append(self.SAFETY_RULES[1])  # no concrete prescriptions
        if self._gives_concrete_diagnosis(response, seeking_real_help):
            violations.append(self.SAFETY_RULES[0])  # no real diagnosis
        if find_keywords(response, self._SELF_TREATMENT_PHRASES):
            violations.append(self.SAFETY_RULES[3])  # no self-treatment

        # De-duplicate while preserving order.
        violations = list(dict.fromkeys(violations))

        is_safe = not violations and not is_emergency

        report = SafetyReport(
            is_safe=is_safe,
            violations=violations,
            is_emergency=is_emergency,
            disclaimer=DISCLAIMER_VI,
            redirect_message=redirect_message,
        )

        if violations:
            logger.info("Safety violations detected: %s", violations)
        return report

    def _gives_concrete_diagnosis(
        self, response: str, seeking_real_help: bool
    ) -> bool:
        """Heuristic: response diagnoses a real person.

        Only treated as a violation when the user appears to be seeking
        personal help AND the response uses second-person diagnostic phrasing,
        to avoid flagging legitimate educational explanations.

        Args:
            response: The agent's response text.
            seeking_real_help: Whether the user input looked like a personal
                medical request.

        Returns:
            ``True`` if the response appears to diagnose a real person.
        """
        if not seeking_real_help:
            return False
        norm = normalize(response)
        diagnostic_markers = [
            "ban bi", "ban da mac", "ban dang bi", "chan doan cua ban la",
            "ban mac benh", "you have", "you are diagnosed",
        ]
        return any(marker in norm for marker in diagnostic_markers)
