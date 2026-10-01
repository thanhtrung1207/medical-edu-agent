from memory import SessionManager


def test_reassign_user_sessions_moves_all_matching_sessions(tmp_path):
    manager = SessionManager(str(tmp_path / "sessions.db"))
    s1 = manager.create_session("anon-1")
    s2 = manager.create_session("anon-1")
    s3 = manager.create_session("other-user")

    moved = manager.reassign_user_sessions("anon-1", "user-42")

    assert moved == 2
    assert manager.get_session(s1.id).user_id == "user-42"
    assert manager.get_session(s2.id).user_id == "user-42"
    assert manager.get_session(s3.id).user_id == "other-user"


def test_reassign_user_sessions_returns_zero_when_no_match(tmp_path):
    manager = SessionManager(str(tmp_path / "sessions.db"))
    moved = manager.reassign_user_sessions("nobody", "user-99")
    assert moved == 0
