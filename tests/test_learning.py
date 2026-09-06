"""Tests for the self-learning module (feedback, adaptive engine, errors).

These tests use only the standard library plus the project's own SQLite-backed
``LearningDatabase`` (via the ``learning_db`` fixture on a temp DB), so they run
without any optional ML dependencies.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from learning import AdaptiveEngine, ErrorCorrector, FeedbackCollector


class TestFeedbackCollector:
    def test_record_feedback(self, learning_db):
        """Record and retrieve feedback."""
        collector = FeedbackCollector(learning_db)

        fb = collector.record_feedback("s1", "u1", "m1", rating=5)

        assert fb.id is not None
        assert fb.rating == 5
        stats = collector.get_user_feedback_stats("u1")
        assert stats["total"] == 1

    def test_feedback_stats(self, learning_db):
        """Get aggregate stats for a user."""
        collector = FeedbackCollector(learning_db)
        collector.record_feedback("s1", "u1", "m1", rating=5)
        collector.record_feedback("s1", "u1", "m2", rating=3, correction="Sửa")

        stats = collector.get_user_feedback_stats("u1")

        assert stats["total"] == 2
        assert stats["average_rating"] == 4.0
        assert stats["corrections"] == 1

    def test_low_rated_topics(self, learning_db):
        """Identify poorly-rated topics."""
        collector = FeedbackCollector(learning_db)
        collector.record_feedback(
            "s1", "u1", "m1", rating=2, correction="Nhồi máu cơ tim"
        )
        collector.record_feedback(
            "s1", "u1", "m2", rating=1, correction="Nhồi máu cơ tim"
        )

        low = collector.get_low_rated_topics(threshold=3.0)

        assert "Nhồi máu cơ tim" in low


class TestAdaptiveEngine:
    def test_update_progress_correct(self, learning_db):
        """Correct answer increases mastery."""
        engine = AdaptiveEngine(learning_db)

        progress = engine.update_progress("u1", "cardiology", is_correct=True)

        assert progress.mastery_level > 0.0
        assert progress.attempts == 1
        assert progress.correct_count == 1

    def test_update_progress_incorrect(self, learning_db):
        """Incorrect answer decreases mastery."""
        engine = AdaptiveEngine(learning_db)
        engine.update_progress("u1", "cardiology", is_correct=True)
        engine.update_progress("u1", "cardiology", is_correct=True)

        progress = engine.update_progress("u1", "cardiology", is_correct=False)

        assert progress.mastery_level < 0.30

    def test_spaced_repetition_interval(self, learning_db):
        """Next review date follows the SM-2-style algorithm."""
        engine = AdaptiveEngine(learning_db)

        correct_review = engine.calculate_next_review(
            mastery_level=0.8, attempts=3, is_correct=True
        )
        incorrect_review = engine.calculate_next_review(
            mastery_level=0.8, attempts=3, is_correct=False
        )

        # An incorrect answer resets the interval to the minimum, so it is due
        # sooner than after a correct answer.
        assert incorrect_review < correct_review
        assert incorrect_review <= datetime.utcnow() + timedelta(days=2)

    def test_weak_areas(self, learning_db):
        """Identify topics below threshold."""
        engine = AdaptiveEngine(learning_db)
        engine.update_progress("u1", "weak_topic", is_correct=False)
        for _ in range(5):
            engine.update_progress("u1", "strong_topic", is_correct=True)

        weak = engine.get_weak_areas("u1", threshold=0.4)

        assert "weak_topic" in weak
        assert "strong_topic" not in weak

    def test_recommendations(self, learning_db):
        """Generate topic recommendations."""
        engine = AdaptiveEngine(learning_db)
        engine.update_progress("u1", "topic_a", is_correct=False)

        recs = engine.recommend_topics("u1", count=5)

        assert isinstance(recs, list)
        assert any(r["topic"] == "topic_a" for r in recs)

    def test_difficulty_level(self, learning_db):
        """Difficulty matches mastery level."""
        engine = AdaptiveEngine(learning_db)

        # No progress -> lowest mastery -> easy.
        assert engine.get_difficulty_level("new_user", "topic") == "easy"

        for _ in range(6):
            engine.update_progress("u2", "topic", is_correct=True)
        assert engine.get_difficulty_level("u2", "topic") == "hard"


class TestErrorCorrector:
    def test_record_and_retrieve_error(self, learning_db):
        """Record an error and find it later."""
        corrector = ErrorCorrector(learning_db)
        corrector.record_error(
            topic="cardiology",
            incorrect_claim="Tim có 3 buồng",
            correct_info="Tim có 4 buồng",
            source="Sách Giải phẫu",
        )

        errors = corrector.get_known_errors("cardiology")

        assert len(errors) == 1
        assert errors[0]["correct_info"] == "Tim có 4 buồng"

    def test_avoidance_context(self, learning_db):
        """Build prompt context with known errors."""
        corrector = ErrorCorrector(learning_db)
        corrector.record_error(
            topic="cardiology",
            incorrect_claim="Tim có 3 buồng",
            correct_info="Tim có 4 buồng",
            source="Sách Giải phẫu",
        )

        context = corrector.build_error_avoidance_context("cardiology")
        assert "Tim có 4 buồng" in context

        # No errors for an unknown topic -> empty context.
        assert corrector.build_error_avoidance_context("unknown_topic") == ""
