"""Tests for Real-time SSE streaming with ReAct events and tool execution."""

import json
from api.deps import services


def test_realtime_sse_streaming_emits_react_trajectory(test_client, monkeypatch):
    """Test that streaming mode yields confirm, thought, tool calls, answer, verify, and done frames."""
    captured_tool_calls = []
    calls = {"count": 0}

    async def fake_step_llm(prompt: str) -> str:
        calls["count"] += 1
        if calls["count"] == 1:
            # Step 1: Decide to use drug_lookup
            return json.dumps({
                "thought": "Cần tra cứu dược lý học của Lidocaine",
                "action": "drug_lookup",
                "action_input": "Lidocaine 2%"
            })
        # Step 2: Final answer
        return json.dumps({
            "thought": "Đã có đủ dữ liệu, đưa ra câu hỏi Socratic",
            "final_answer": "Chào em, với Lidocaine 2% có Adrenaline, em lưu ý gì về liều tối đa? [RAG1]"
        })

    def fake_drug_lookup(drug_name: str) -> str:
        captured_tool_calls.append(drug_name)
        return "Lidocaine 2% với Adrenaline 1:100.000: Liều tối đa 4.4 mg/kg, không quá 300mg."

    async def fake_verify(state):
        state["verified_answer"] = state["formatted_answer"]
        state["confidence_score"] = 0.95
        return state

    monkeypatch.setattr(services.react_runner, "_llm", fake_step_llm)
    monkeypatch.setattr(services.react_runner, "_drug_lookup", fake_drug_lookup)
    monkeypatch.setattr(services.react_runner, "_verify", fake_verify)

    response = test_client.post(
        "/api/chat",
        json={
            "message": "Thuốc tê Lidocaine dùng thế nào?",
            "user_id": "student_dentist_01",
            "stream": True,
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "X-Trace-ID" in response.headers

    # Parse all data: frames
    lines = [line.strip() for line in response.text.split("\n") if line.startswith("data: ")]
    events = [json.loads(line[6:]) for line in lines]

    event_steps = [e["step"] for e in events]
    assert "confirm" in event_steps
    assert "thought" in event_steps
    assert "tool_call" in event_steps
    assert "tool_result" in event_steps
    assert "answer" in event_steps
    assert "verify" in event_steps
    assert "done" in event_steps

    # Verify tool call was actually executed
    assert captured_tool_calls == ["Lidocaine 2%"]

    # Verify done event contents
    done_event = next(e for e in events if e["step"] == "done")
    assert "Lidocaine 2%" in done_event["content"]["answer"]
    assert done_event["content"]["trace_id"].startswith("tr-")
