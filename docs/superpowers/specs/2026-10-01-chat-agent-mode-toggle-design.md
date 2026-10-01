# Chat vs Agent Mode Toggle — Design Spec

## Context

Today every chat message goes through one path: `POST /api/chat` → RAG retrieval over ChromaDB → `MedicalReasoningWorkflow` (Confirm → Think → Answer → Verify) → `GuardrailRunner` post-checks. This workflow is tuned for grounded, in-domain dental education Q&A against the ingested corpus. It cannot answer anything that isn't in the corpus, and it does only one retrieval round.

Users have two distinct needs that this single path serves poorly:
- **Quick fact lookups** that live on the open web (e.g. "latest ADA guideline for X", a drug recall, a Vietnamese MOH announcement) — the current pipeline either refuses or hallucinates because there is no corpus coverage.
- **Deep research questions** where one RAG hit is not enough — the model needs to search the web, read a source, go back, search again, and synthesize across several rounds.

This spec adds a mode toggle in the chat input (**Chat** vs **Agent**) that routes each turn to a different pipeline, and introduces web search + an iterative ReAct loop as new backend capabilities.

## Goals

- Add a two-option mode selector in the chat input area. Default = **Chat** (fast). User can switch to **Agent** (deep) per message.
- **Chat mode**: single Tavily web search → LLM summarize with inline citations. Bypasses RAG and `MedicalReasoningWorkflow`. Guardrails still run (scope + emergency + safety).
- **Agent mode**: ReAct loop. On each iteration the LLM reasons about what it still needs, picks one tool (`rag_search`, `web_search`, or `read_url`), observes the result, then decides to continue or finalize. Max 5 iterations, hard-stopped. Final answer still passes through guardrail post-checks.
- The mode is per-message, not per-session — a user can mix Chat and Agent turns in the same conversation.
- Backward-compatible by construction: existing clients that omit `mode` fall back to the server default `"agent"`, which routes to `ReActRunner`. `ReActRunner` is a strict superset of today's pipeline — same `rag_search`, same guardrails, same `reasoning_steps` shape; it just gains the option to call `web_search`/`read_url` when the LLM decides it needs them. For a message where the LLM finalizes on iteration 1 after a single `rag_search`, the user-visible output is equivalent to today.

## Non-goals

- Multiple parallel web searches ("deep research" style). Agent mode runs the loop sequentially.
- Caching of Tavily results. Each `web_search` call hits the API.
- Letting the user tune `max_iterations` from the UI. It's a backend config knob (`AGENT_MAX_ITERATIONS`, default 5).
- A separate "chat history" per mode. Both modes write to the same `sessions.db` chat history as today.
- Agent-mode streaming of individual ReAct iterations as separate SSE events in v1. We stream one combined `think` event at the end of the loop (same shape as today's `reasoning_steps`). Per-iteration streaming can come in v2.
- Changing the existing anatomy/drug/medical ADK sub-agents. ReAct is implemented at the API layer, orchestrating the existing `rag_search` capability as a callable tool — not by rewiring the Google ADK agent graph.

## Architecture

### Request / response contract

`api/models.py` — extend `ChatRequest`:

```python
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    user_id: str = Field(min_length=1, max_length=128)
    stream: bool = False
    mode: Literal["chat", "agent"] = "agent"  # default preserves today's behavior
```

No change to `ChatResponse`. Mode-specific info rides in existing fields:
- `reasoning_steps` already carries the step narrative; Chat mode populates it with a single "🌐 Tìm kiếm web" entry, Agent mode populates it with one entry per ReAct iteration.
- `citations` carries both RAG sources and web sources uniformly. A `Citation` with a URL in `source` indicates a web citation.

### Backend file structure

New files:
- `tools/web_search.py` — Tavily client. Exposes `tavily_search(query: str, max_results: int = 5) -> list[dict]` returning `[{title, url, snippet, content}]`. Reads `TAVILY_API_KEY` from env. Raises `WebSearchError` on API failure or missing key. One retry on 429/5xx with exponential backoff (same pattern as `tools/medical_search.py` already uses for Chroma).
- `tools/url_reader.py` — fetches a URL and returns cleaned text (first ~8000 chars). Uses `httpx` + `readability-lxml` (new dep). Raises `UrlReadError` on fetch failure, non-HTML content type, or robots-disallowed response.
- `agents/workflow/chat_mode.py` — new `ChatModeRunner`. Public method `async run(message: str, context: dict) -> dict` returning the same state dict shape produced by `MedicalReasoningWorkflow.run` (`formatted_answer`, `verified_answer`, `reasoning_steps`, `citations`, `retrieved_sources`, `confidence_score`, `warnings`). Internally: call `tavily_search(message, max_results=5)` → build an LLM prompt that includes the user's question + the search snippets + prior-turn context → call the LLM once to produce a Vietnamese summary with `[n]` inline citations → map each `[n]` to a `Citation(source=url_or_title, quote=snippet)`.
- `agents/workflow/react_runner.py` — new `ReActRunner`. Public method `async run(message: str, context: dict) -> dict` returning the same state dict shape. Internally runs the loop:
  1. Build the system prompt describing the three tools (`rag_search(query)`, `web_search(query)`, `read_url(url)`) and the required `action`/`action_input`/`final_answer` JSON schema.
  2. Each iteration: ask the LLM for a JSON step `{thought, action?, action_input?, final_answer?}`.
  3. If `final_answer` is present → run the collected trajectory through the existing `MedicalReasoningWorkflow` **Verify** stage only (so grounding + confidence scoring still apply), then return.
  4. If `action` is present → execute the corresponding tool. `rag_search` invokes the same ChromaDB-backed `MedicalSearchTool` the existing `reasoning_workflow` uses — no duplicate retrieval logic. Append `{thought, action, action_input, observation}` to the trajectory, and loop.
  5. Hard stop at `max_iterations=5` — if the LLM never produced a `final_answer`, force one final synthesis call that must produce an answer from the trajectory so far, then still run the Verify stage.
  6. Convert trajectory into `reasoning_steps` (one Vietnamese line per iteration: "🧭 Bước N — <tool>(<short input>)"). Convert collected sources (both RAG and web) into `citations` + `retrieved_sources`.

Modified files:
- `api/chat.py` — route by `request.mode`:
  - `"chat"` → call `ChatModeRunner.run` instead of `svc.reasoning_workflow.run`.
  - `"agent"` → call `svc.react_runner.run` (which internally wraps today's RAG-focused workflow with the ReAct loop).
  - The pre-check guardrails (scope + emergency) and post-check guardrails (hallucination + safety + confidence) still run around whichever runner was picked. No change to that order.
- `api/deps.py` — `Services` dataclass gains two new fields: `chat_mode_runner: ChatModeRunner` and `react_runner: ReActRunner`, both wired up in the same `build_services()` function that already wires `reasoning_workflow`.
- `requirements.txt` — add `tavily-python>=0.3.0`, `readability-lxml>=0.8.1`, `lxml>=5.0.0`.
- `.env.example` — add `TAVILY_API_KEY=your_tavily_api_key_here`, `AGENT_MAX_ITERATIONS=5`.

### Frontend file structure

New file:
- `frontend/src/components/chat/ChatModeToggle.tsx` — presentational segmented control. Props: `value: "chat" | "agent"`, `onChange: (next) => void`, `disabled?: boolean`. Renders two side-by-side pill buttons: `⚡ Chat` and `🔍 Agent`. Active pill uses the project's `bg-primary text-white` pattern; inactive uses `text-slate-500 hover:bg-slate-100`. Each pill is `min-h-[44px]` for accessibility. Includes a one-line hint under the toggle when Agent is selected: "Chậm hơn, phân tích sâu".

Modified files:
- `frontend/src/components/chat/ChatInterface.tsx` — hold `const [mode, setMode] = useState<"chat" | "agent">("chat")`. The default is **chat** here (per user preference for fast first-touch), overriding the backend default of `"agent"` for backward compat. The toggle sits above the input textarea, inline with the "Send" area. Pass `mode` to `sendMessage` and the SSE handler.
- `frontend/src/lib/api.ts` — `sendMessage(message, userId, sessionId, mode)` and the SSE helper gain a `mode` parameter, forwarded as `mode` in the JSON body. If not supplied, send nothing (backend default kicks in — preserves backward compat with any caller that didn't update).
- `frontend/src/lib/types.ts` — add `export type ChatMode = "chat" | "agent";`.

### Data flow (per turn)

```
user types "ADA guideline mới nhất về composite?"
     ↓
UI: mode=chat selected
     ↓
POST /api/chat { message, user_id, session_id?, mode: "chat" }
     ↓
api/chat.py:
  1. resolve/create session
  2. persist user message
  3. guardrail pre-checks (scope + emergency)  ← unchanged
  4. build context from memory                 ← unchanged
  5. route by mode:
       chat  → ChatModeRunner.run(message, context)
       agent → ReActRunner.run(message, context)
  6. guardrail post-checks                     ← unchanged
  7. persist assistant message                 ← unchanged
     ↓
return ChatResponse(answer, citations, reasoning_steps, ...)
```

### Error handling

- `WebSearchError` (Tavily down, bad key, rate-limited after retry): Chat mode fails safe by returning an assistant message explaining "Tạm thời không thể tìm kiếm web, vui lòng thử lại sau" + the raw error class name in `warnings`. Agent mode treats it as a tool failure — the ReAct loop sees the error as the observation and can switch to `rag_search` next iteration.
- `UrlReadError`: Agent-mode only. Same treatment as `WebSearchError` — observation becomes the error message, loop continues.
- Max-iterations hit with no `final_answer`: `ReActRunner` forces a final synthesis call (as described above). Not an error path for the user.
- Malformed LLM JSON step: `ReActRunner` retries the current iteration once with a corrective prompt ("Your previous output was not valid JSON. Respond with the schema shown earlier."). If the retry also fails, that iteration is skipped and the loop advances.

### Guardrail interaction

The two existing guardrail stages run around the mode-specific runner identically for both modes:
- Pre-checks still run on the raw user `message` (scope + emergency) before any routing decision. Out-of-scope messages short-circuit before either runner is invoked.
- Post-checks run on the final `answer` text and the `retrieved_sources` list (the hallucination grounding check pulls content from both RAG and web sources uniformly).

This means Chat mode gets the same safety floor as Agent mode — nothing bypasses guardrails.

### Config

- `TAVILY_API_KEY` (required for Chat mode and Agent mode's `web_search` tool). If unset, Chat mode fails with a clear 503 error before invoking the LLM. Agent mode continues to function with only RAG + `read_url` tools available; the ReAct system prompt is adjusted at build-time to omit `web_search` when the key is absent.
- `AGENT_MAX_ITERATIONS` (default 5, settable 1–10). Bounds the ReAct loop.
- No new frontend env vars.

## Testing

Following the existing Pytest + Vitest conventions already used throughout the project:

**Backend** (`tests/`):

- `tests/test_web_search_tool.py` — mocks `httpx` responses. Cases: happy path returns parsed results, 429 triggers one retry, missing API key raises `WebSearchError`, malformed response raises `WebSearchError`.
- `tests/test_url_reader.py` — mocks `httpx` + readability. Cases: HTML page → cleaned text; non-HTML Content-Type → `UrlReadError`; fetch timeout → `UrlReadError`; truncation at 8000 chars confirmed.
- `tests/test_chat_mode_runner.py` — mocks `tavily_search` and the LLM. Cases: happy path returns a state dict with populated `citations` and `reasoning_steps`; tavily failure returns a graceful fallback state with `warnings` populated and no `citations`.
- `tests/test_react_runner.py` — mocks the LLM and all three tools. Cases:
  - LLM returns `final_answer` on iteration 1 → loop exits early, trajectory has 1 entry.
  - LLM calls `rag_search` on iter 1, `web_search` on iter 2, `final_answer` on iter 3 → trajectory has 3 entries, `citations` includes both RAG and web sources.
  - LLM calls tools 5 times without a `final_answer` → forced synthesis path produces a non-empty `verified_answer` and `warnings` includes "max iterations reached".
  - LLM returns malformed JSON on iter 1 → retry succeeds on iter 1 → test asserts retry happened once and loop continued normally.
  - `web_search` tool raises `WebSearchError` → observation reflects the error → loop proceeds.
- `tests/test_chat_mode_routing.py` — integration test exercising `POST /api/chat` with `mode="chat"` and `mode="agent"`, asserting the correct runner was invoked (via `monkeypatch` on the `Services`), guardrails ran in both cases, and `mode` omitted still defaults to `"agent"` for backward compat with existing clients.

**Frontend** (`frontend/src/components/chat/`):

- `ChatModeToggle.test.tsx` (new): asserts both pills are rendered, the active one has `aria-pressed="true"` (or equivalent accessible name including "selected"), clicking the inactive one calls `onChange("agent")` / `onChange("chat")`, and each pill is `min-h-[44px]`.
- `ChatInterface.test.tsx` (modify): extend the existing "sends a message" test to also assert that the request body includes `mode: "chat"` by default; add a new test that clicks the Agent pill and asserts the next request body includes `mode: "agent"`. The existing `fetch` mock pattern used by this file is reused — no new mock infrastructure needed.

**Manual E2E** (one checklist entry): send one Chat-mode message that requires fresh web info, verify the answer cites URLs; switch to Agent, send a question that needs both RAG and web, verify `reasoning_steps` shows multiple ReAct steps and `citations` mixes PDF sources with URLs.

## Rollout

1. Backend lands first behind the mode toggle (default stays `"agent"` server-side so no existing client breaks).
2. Frontend ships the toggle in the same release. Default UI value is `"chat"` because that's the faster-feeling first experience the user asked for; users switch to Agent for deep questions.
3. If Tavily is unavailable at deploy time (key not set in prod), Chat pill is still visible but any Chat-mode request returns a 503 with a user-visible message. Agent mode still works without web search (RAG + `read_url` only).

## Open questions

None. All ambiguities resolved during brainstorming:
- Mode scope → "Chat = web search mới, Agent = pipeline hiện tại" (with ReAct wrapping)
- Provider → Tavily
- Agent loop style → ReAct
