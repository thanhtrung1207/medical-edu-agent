# Chat vs Agent Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-message Chat/Agent mode toggle to the chat input. Chat mode summarizes a single Tavily web search; Agent mode runs a ReAct loop over `rag_search`/`web_search`/`read_url` (max 5 iterations) and still passes through the existing Verify guardrail stage.

**Architecture:** Two new runners (`ChatModeRunner`, `ReActRunner`) sit next to today's `MedicalReasoningWorkflow`. `api/chat.py` picks the runner based on `ChatRequest.mode`. Guardrails pre/post-checks run unchanged around whichever runner was picked. Frontend ships a `ChatModeToggle` segmented control above the chat input.

**Tech Stack:** FastAPI + Pydantic + httpx + Tavily API + readability-lxml (backend), Next.js + React + Tailwind + Vitest + Testing Library (frontend).

**Spec reference:** `docs/superpowers/specs/2026-10-01-chat-agent-mode-toggle-design.md`

---

## Task 1: Backend dependencies and env vars

**Files:**
- Modify: `requirements.txt`
- Modify: `.env.example`

- [ ] **Step 1: Add Python dependencies**

Append to `requirements.txt` (keep existing lines intact):

```
tavily-python>=0.3.0
readability-lxml>=0.8.1
lxml>=5.0.0
```

- [ ] **Step 2: Add env var examples**

Append to `.env.example` (keep existing lines intact):

```
# Tavily web-search provider (required for Chat mode; Agent mode degrades gracefully if unset)
TAVILY_API_KEY=your_tavily_api_key_here
# Hard cap on the Agent-mode ReAct loop (1..10, default 5)
AGENT_MAX_ITERATIONS=5
```

- [ ] **Step 3: Install dependencies**

Run: `./venv/bin/pip install -r requirements.txt`
Expected: `Successfully installed tavily-python-... readability-lxml-... lxml-...`

- [ ] **Step 4: Commit**

```bash
git add requirements.txt .env.example
git commit -m "feat(chat-mode): add tavily + readability deps and example env vars"
```

---

## Task 2: Web-search tool (Tavily client)

**Files:**
- Create: `tools/web_search.py`
- Test: `tests/test_web_search_tool.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_web_search_tool.py`:

```python
"""Tests for the Tavily-backed web-search tool."""

from __future__ import annotations

import pytest

from tools.web_search import WebSearchError, tavily_search


class _StubClient:
    """Minimal stand-in for tavily.TavilyClient."""

    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.calls = []

    def search(self, query, **kwargs):
        self.calls.append({"query": query, **kwargs})
        if self._exc is not None:
            raise self._exc
        return self._response


def test_tavily_search_returns_normalized_results(monkeypatch):
    stub = _StubClient(
        response={
            "results": [
                {
                    "title": "ADA composite guideline 2025",
                    "url": "https://ada.org/x",
                    "content": "Full body text ...",
                    "snippet": "Short snippet",
                }
            ]
        }
    )
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    results = tavily_search("latest composite guideline", max_results=3)

    assert results == [
        {
            "title": "ADA composite guideline 2025",
            "url": "https://ada.org/x",
            "snippet": "Short snippet",
            "content": "Full body text ...",
        }
    ]
    assert stub.calls[0]["query"] == "latest composite guideline"
    assert stub.calls[0]["max_results"] == 3


def test_tavily_search_missing_key_raises(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    with pytest.raises(WebSearchError) as exc:
        tavily_search("anything")

    assert "TAVILY_API_KEY" in str(exc.value)


def test_tavily_search_api_failure_raises(monkeypatch):
    stub = _StubClient(exc=RuntimeError("boom"))
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(
        "tools.web_search._build_client", lambda api_key: stub
    )

    with pytest.raises(WebSearchError):
        tavily_search("anything")


def test_tavily_search_empty_query_returns_empty_list(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    assert tavily_search("   ") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_web_search_tool.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.web_search'`

- [ ] **Step 3: Write minimal implementation**

Create `tools/web_search.py`:

```python
"""Tavily-backed web search tool used by Chat mode and the Agent ReAct loop."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

__all__ = ["WebSearchError", "tavily_search"]


class WebSearchError(RuntimeError):
    """Raised when the web search provider cannot answer the query."""


def _build_client(api_key: str):
    """Construct a Tavily client. Isolated so tests can monkeypatch it."""
    from tavily import TavilyClient  # Imported lazily; package is optional at import time.

    return TavilyClient(api_key=api_key)


def tavily_search(
    query: str,
    max_results: int = 5,
    search_depth: str = "advanced",
) -> List[Dict[str, Any]]:
    """Run one Tavily search and return normalized results.

    Args:
        query: The natural-language query.
        max_results: Upper bound on results returned to the caller.
        search_depth: ``"basic"`` or ``"advanced"`` — passed through to Tavily.

    Returns:
        A list of ``{title, url, snippet, content}`` dicts. Empty when the
        query is blank.

    Raises:
        WebSearchError: Missing ``TAVILY_API_KEY``, API failure, or malformed
            response.
    """
    cleaned = (query or "").strip()
    if not cleaned:
        return []

    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise WebSearchError(
            "TAVILY_API_KEY chưa được cấu hình. Không thể gọi web search."
        )

    try:
        client = _build_client(api_key)
        response = client.search(
            cleaned,
            max_results=max_results,
            search_depth=search_depth,
        )
    except WebSearchError:
        raise
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        raise WebSearchError(f"Tavily search failed: {exc}") from exc

    raw_results: Optional[List[Dict[str, Any]]] = None
    if isinstance(response, dict):
        raw_results = response.get("results")
    if not isinstance(raw_results, list):
        raise WebSearchError("Phản hồi từ Tavily không có trường 'results'.")

    normalized: List[Dict[str, Any]] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("url") or "").strip(),
                "snippet": str(item.get("snippet") or "").strip(),
                "content": str(item.get("content") or "").strip(),
            }
        )
    return normalized
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_web_search_tool.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add tools/web_search.py tests/test_web_search_tool.py
git commit -m "feat(chat-mode): add tavily_search tool with env-key + error handling"
```

---

## Task 3: URL reader tool

**Files:**
- Create: `tools/url_reader.py`
- Test: `tests/test_url_reader.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_url_reader.py`:

```python
"""Tests for the readability-based URL reader tool."""

from __future__ import annotations

import pytest

from tools.url_reader import UrlReadError, read_url


class _StubResponse:
    def __init__(self, status_code=200, content_type="text/html; charset=utf-8", text=""):
        self.status_code = status_code
        self.headers = {"content-type": content_type}
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def _fake_summary(html):
    return "<p>Readable text extracted.</p>"


def test_read_url_returns_cleaned_text(monkeypatch):
    html = "<html><body><p>Hello world — Xin chào.</p></body></html>"

    def fake_get(url, **kwargs):
        return _StubResponse(text=html)

    monkeypatch.setattr("tools.url_reader._http_get", fake_get)
    monkeypatch.setattr("tools.url_reader._readable_html", lambda h: "<p>Hello world — Xin chào.</p>")

    result = read_url("https://example.com")

    assert "Hello world" in result
    assert "<p>" not in result  # tags stripped
    assert len(result) <= 8000


def test_read_url_truncates_to_8000_chars(monkeypatch):
    long_html = "<p>" + ("A" * 20000) + "</p>"
    monkeypatch.setattr(
        "tools.url_reader._http_get", lambda u, **k: _StubResponse(text=long_html)
    )
    monkeypatch.setattr(
        "tools.url_reader._readable_html", lambda h: long_html
    )

    result = read_url("https://example.com")
    assert len(result) == 8000


def test_read_url_rejects_non_html(monkeypatch):
    monkeypatch.setattr(
        "tools.url_reader._http_get",
        lambda u, **k: _StubResponse(content_type="application/pdf", text="binary"),
    )

    with pytest.raises(UrlReadError):
        read_url("https://example.com/file.pdf")


def test_read_url_fetch_failure(monkeypatch):
    def raiser(*args, **kwargs):
        raise RuntimeError("timeout")

    monkeypatch.setattr("tools.url_reader._http_get", raiser)

    with pytest.raises(UrlReadError):
        read_url("https://example.com")


def test_read_url_empty_url_raises():
    with pytest.raises(UrlReadError):
        read_url("   ")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_url_reader.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tools.url_reader'`

- [ ] **Step 3: Write minimal implementation**

Create `tools/url_reader.py`:

```python
"""Fetch a URL and return cleaned readable text for the Agent ReAct loop."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

__all__ = ["UrlReadError", "read_url"]

MAX_CHARS = 8000
_TIMEOUT_SECONDS = 10.0


class UrlReadError(RuntimeError):
    """Raised when a URL cannot be fetched or parsed as HTML."""


def _http_get(url: str, **kwargs: Any) -> httpx.Response:
    """Perform the HTTP GET. Isolated so tests can monkeypatch it."""
    return httpx.get(
        url,
        timeout=_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": "medical-edu-agent/1.0 (+https://unident.local)"},
        **kwargs,
    )


def _readable_html(html: str) -> str:
    """Run readability on the raw HTML. Isolated for monkeypatching in tests."""
    from readability import Document

    return Document(html).summary(html_partial=True)


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(html: str) -> str:
    """Strip tags and collapse whitespace."""
    text = _TAG_RE.sub(" ", html)
    text = _WS_RE.sub(" ", text).strip()
    return text


def read_url(url: str) -> str:
    """Fetch ``url`` and return cleaned readable text (<= MAX_CHARS).

    Raises:
        UrlReadError: Empty URL, fetch failure, non-HTML content type, or
            empty extraction result.
    """
    cleaned = (url or "").strip()
    if not cleaned:
        raise UrlReadError("URL rỗng.")

    try:
        response = _http_get(cleaned)
    except Exception as exc:
        logger.warning("URL fetch failed: %s", exc)
        raise UrlReadError(f"Không thể tải URL: {exc}") from exc

    try:
        response.raise_for_status()
    except Exception as exc:
        raise UrlReadError(f"HTTP lỗi khi tải {cleaned}: {exc}") from exc

    content_type = (response.headers.get("content-type") or "").lower()
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        raise UrlReadError(
            f"Content-Type không phải HTML ({content_type or 'unknown'})."
        )

    try:
        readable = _readable_html(response.text)
    except Exception as exc:
        raise UrlReadError(f"Lỗi khi parse HTML: {exc}") from exc

    text = _strip_html(readable)
    if not text:
        raise UrlReadError("Trang không có nội dung đọc được.")
    return text[:MAX_CHARS]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_url_reader.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add tools/url_reader.py tests/test_url_reader.py
git commit -m "feat(chat-mode): add read_url tool backed by httpx + readability"
```

---

## Task 4: Extend ChatRequest with the `mode` field

**Files:**
- Modify: `api/models.py:22-29`
- Test: `tests/test_chat_request_mode.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_chat_request_mode.py`:

```python
"""Tests for the new ChatRequest.mode field."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.models import ChatRequest


def test_chat_request_defaults_to_agent_mode():
    req = ChatRequest(message="hello", user_id="u1")
    assert req.mode == "agent"


def test_chat_request_accepts_chat_mode():
    req = ChatRequest(message="hello", user_id="u1", mode="chat")
    assert req.mode == "chat"


def test_chat_request_accepts_agent_mode_explicit():
    req = ChatRequest(message="hello", user_id="u1", mode="agent")
    assert req.mode == "agent"


def test_chat_request_rejects_unknown_mode():
    with pytest.raises(ValidationError):
        ChatRequest(message="hello", user_id="u1", mode="deep-research")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_chat_request_mode.py -v`
Expected: FAIL on `test_chat_request_defaults_to_agent_mode` with `AttributeError` or similar (field doesn't exist yet)

- [ ] **Step 3: Modify `api/models.py` ChatRequest**

In `api/models.py`, update the `ChatRequest` class:

```python
from typing import Any, Dict, List, Literal, Optional

# ... later in the file:

class ChatRequest(BaseModel):
    """Body for ``POST /api/chat``."""

    message: str
    session_id: Optional[str] = None
    user_id: str = Field(min_length=1, max_length=128)
    # When true the endpoint returns an SSE stream instead of a JSON body.
    stream: bool = False
    # Runner selector. "chat" = single web-search summary; "agent" = ReAct loop.
    # Default preserves today's behavior for callers that omit the field.
    mode: Literal["chat", "agent"] = "agent"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_chat_request_mode.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add api/models.py tests/test_chat_request_mode.py
git commit -m "feat(chat-mode): add mode field to ChatRequest (defaults to agent)"
```

---

## Task 5: ChatModeRunner (single web search + summary)

**Files:**
- Create: `agents/workflow/chat_mode.py`
- Test: `tests/test_chat_mode_runner.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_chat_mode_runner.py`:

```python
"""Tests for ChatModeRunner — Tavily search → LLM summarize."""

from __future__ import annotations

import pytest

from agents.workflow.chat_mode import ChatModeRunner
from tools.web_search import WebSearchError


SAMPLE_RESULTS = [
    {
        "title": "ADA composite guideline 2025",
        "url": "https://ada.org/x",
        "snippet": "Composite restorations ...",
        "content": "Composite restorations ...",
    },
    {
        "title": "VN MOH thông báo nha khoa",
        "url": "https://moh.gov.vn/y",
        "snippet": "Khuyến cáo mới nhất ...",
        "content": "Khuyến cáo mới nhất ...",
    },
]


@pytest.mark.asyncio
async def test_chat_mode_happy_path(monkeypatch):
    monkeypatch.setattr(
        "agents.workflow.chat_mode.tavily_search",
        lambda query, max_results=5: SAMPLE_RESULTS,
    )

    async def fake_llm(prompt: str) -> str:
        return "Theo [1] và [2], composite ..."

    runner = ChatModeRunner(llm=fake_llm)
    state = await runner.run("ADA guideline mới nhất?", context={})

    assert state["verified_answer"].startswith("Theo [1]")
    assert state["formatted_answer"] == state["verified_answer"]
    assert len(state["retrieved_sources"]) == 2
    assert state["retrieved_sources"][0]["title"] == "ADA composite guideline 2025"
    assert state["reasoning_steps"] == ["🌐 Tìm kiếm web (Tavily, 2 kết quả)"]
    assert state["confidence_score"] == pytest.approx(0.7)
    assert state["warnings"] == []


@pytest.mark.asyncio
async def test_chat_mode_tavily_failure_graceful(monkeypatch):
    def fail(*args, **kwargs):
        raise WebSearchError("missing key")

    monkeypatch.setattr("agents.workflow.chat_mode.tavily_search", fail)

    async def fake_llm(prompt: str) -> str:
        pytest.fail("LLM should not be invoked when search fails")

    runner = ChatModeRunner(llm=fake_llm)
    state = await runner.run("gì đó", context={})

    assert "Tạm thời không thể tìm kiếm web" in state["verified_answer"]
    assert "WebSearchError" in state["warnings"][0]
    assert state["retrieved_sources"] == []
    assert state["citations"] == []
    assert state["confidence_score"] == 0.0


@pytest.mark.asyncio
async def test_chat_mode_empty_results(monkeypatch):
    monkeypatch.setattr(
        "agents.workflow.chat_mode.tavily_search",
        lambda query, max_results=5: [],
    )

    async def fake_llm(prompt: str) -> str:
        pytest.fail("LLM should not be invoked when there are no results")

    runner = ChatModeRunner(llm=fake_llm)
    state = await runner.run("truy vấn không có kết quả", context={})

    assert "Không tìm thấy" in state["verified_answer"]
    assert state["retrieved_sources"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_chat_mode_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.workflow.chat_mode'`

- [ ] **Step 3: Write minimal implementation**

Create `agents/workflow/chat_mode.py`:

```python
"""Chat-mode runner: one Tavily search + one LLM summarize call.

Used when the frontend sends ``ChatRequest.mode == "chat"``. Bypasses RAG and
``MedicalReasoningWorkflow`` entirely. Guardrails pre/post-checks are applied
by the caller in ``api/chat.py``.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from tools.web_search import WebSearchError, tavily_search

logger = logging.getLogger(__name__)

__all__ = ["ChatModeRunner", "LLMCallable"]

LLMCallable = Callable[[str], Awaitable[str]]


_SYSTEM_PROMPT = """Bạn là trợ lý tổng hợp thông tin từ các kết quả web search cho sinh viên nha khoa.

NGUYÊN TẮC:
- Trả lời bằng tiếng Việt, rõ ràng, có cấu trúc.
- Dùng số trong ngoặc vuông để trích dẫn nguồn, ví dụ [1], [2].
- Không bịa thông tin không có trong kết quả search.
- Nếu kết quả không đủ để trả lời, hãy nói thẳng là chưa đủ dữ liệu.
- Luôn kết thúc bằng dòng "Nguồn:" liệt kê URL theo thứ tự [1], [2], ...
"""


def _default_llm() -> LLMCallable:
    """Return the project's default async LLM caller."""
    from agents.model_config import get_primary_model

    model = get_primary_model()

    async def _call(prompt: str) -> str:
        try:
            response = await model.generate_async(prompt)
        except AttributeError:
            response = model.generate(prompt)
        return str(response)

    return _call


class ChatModeRunner:
    """Runs a single Tavily search → LLM summary with inline citations."""

    def __init__(
        self,
        llm: Optional[LLMCallable] = None,
        max_results: int = 5,
    ) -> None:
        self._llm = llm or _default_llm()
        self._max_results = max_results

    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Return a state dict compatible with ``MedicalReasoningWorkflow.run``.

        Keys populated: ``formatted_answer``, ``verified_answer``,
        ``reasoning_steps``, ``citations``, ``retrieved_sources``,
        ``confidence_score``, ``warnings``.
        """
        try:
            results = tavily_search(message, max_results=self._max_results)
        except WebSearchError as exc:
            logger.info("Chat mode search failed: %s", exc)
            fallback = (
                "Tạm thời không thể tìm kiếm web, vui lòng thử lại sau. "
                f"(Chi tiết: {exc})"
            )
            return _fallback_state(fallback, warning=f"WebSearchError: {exc}")

        if not results:
            empty = (
                "Không tìm thấy kết quả web phù hợp cho câu hỏi của bạn. "
                "Thử lại với từ khóa khác hoặc chuyển sang chế độ Agent."
            )
            return _fallback_state(empty, warning=None)

        prompt = _build_prompt(message, results, context)
        try:
            answer_text = await self._llm(prompt)
        except Exception as exc:
            logger.warning("Chat mode LLM call failed: %s", exc)
            return _fallback_state(
                "Đã xảy ra lỗi khi tổng hợp câu trả lời. Vui lòng thử lại sau.",
                warning=f"LLMError: {type(exc).__name__}",
            )

        citations = _results_to_citations(results)
        return {
            "formatted_answer": answer_text,
            "verified_answer": answer_text,
            "reasoning_steps": [
                f"🌐 Tìm kiếm web (Tavily, {len(results)} kết quả)"
            ],
            "citations": [c["source"] for c in citations],
            "retrieved_sources": citations,
            "confidence_score": 0.7,
            "warnings": [],
        }


def _build_prompt(
    message: str,
    results: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> str:
    """Assemble the summarization prompt from search results."""
    numbered: List[str] = []
    for i, item in enumerate(results, start=1):
        title = item.get("title") or item.get("url") or f"Kết quả {i}"
        snippet = item.get("snippet") or item.get("content") or ""
        url = item.get("url") or ""
        numbered.append(f"[{i}] {title}\nURL: {url}\n{snippet}")

    prior = context.get("recent_history") if isinstance(context, dict) else None
    history_block = f"\n\nNGỮ CẢNH TRƯỚC:\n{prior}\n" if prior else ""

    return (
        f"{_SYSTEM_PROMPT}{history_block}\n\nCÂU HỎI: {message}\n\n"
        "KẾT QUẢ WEB SEARCH:\n" + "\n\n".join(numbered) + "\n\n"
        "Hãy tổng hợp câu trả lời dựa trên các kết quả trên."
    )


def _results_to_citations(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map Tavily results to the retrieved_sources shape used by the API layer."""
    out: List[Dict[str, Any]] = []
    for item in results:
        title = item.get("title") or item.get("url") or "Web source"
        snippet = item.get("snippet") or item.get("content") or ""
        out.append(
            {
                "title": title,
                "source": item.get("url") or title,
                "snippet": snippet,
                "content": item.get("content") or snippet,
            }
        )
    return out


def _fallback_state(message: str, warning: Optional[str]) -> Dict[str, Any]:
    return {
        "formatted_answer": message,
        "verified_answer": message,
        "reasoning_steps": ["🌐 Web search không khả dụng"],
        "citations": [],
        "retrieved_sources": [],
        "confidence_score": 0.0,
        "warnings": [warning] if warning else [],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_chat_mode_runner.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add agents/workflow/chat_mode.py tests/test_chat_mode_runner.py
git commit -m "feat(chat-mode): add ChatModeRunner for single-search summaries"
```

---

## Task 6: ReActRunner (looping agent)

**Files:**
- Create: `agents/workflow/react_runner.py`
- Test: `tests/test_react_runner.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_react_runner.py`:

```python
"""Tests for ReActRunner — looping tool-use agent."""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from agents.workflow.react_runner import ReActRunner
from tools.web_search import WebSearchError


def _llm_from_steps(steps: List[str]):
    """Return a fake async LLM that yields the given step strings in order."""
    idx = {"i": 0}

    async def _llm(prompt: str) -> str:
        i = idx["i"]
        idx["i"] = i + 1
        return steps[i]

    return _llm


@pytest.mark.asyncio
async def test_react_final_on_iteration_1():
    llm = _llm_from_steps([
        json.dumps({"thought": "I know this", "final_answer": "Đáp án ngắn."})
    ])
    runner = ReActRunner(
        llm=llm,
        rag_search=lambda q: pytest.fail("rag should not be called"),
        web_search=lambda q: pytest.fail("web should not be called"),
        read_url=lambda u: pytest.fail("read_url should not be called"),
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("1+1?", context={})

    assert state["verified_answer"] == "Đáp án ngắn."
    assert state["reasoning_steps"] == ["🧭 Bước 1 — final_answer"]
    assert state["warnings"] == []


@pytest.mark.asyncio
async def test_react_rag_then_web_then_final():
    steps = [
        json.dumps({"thought": "look up RAG", "action": "rag_search", "action_input": "implant"}),
        json.dumps({"thought": "need fresh info", "action": "web_search", "action_input": "ADA implant 2025"}),
        json.dumps({"thought": "done", "final_answer": "Theo [RAG1] và [WEB1]..."}),
    ]
    runner = ReActRunner(
        llm=_llm_from_steps(steps),
        rag_search=lambda q: [{"title": "Implant book", "snippet": "chap 1", "content": "chap 1", "source": "Implant book"}],
        web_search=lambda q: [{"title": "ADA 2025", "url": "https://ada.org/i", "snippet": "s", "content": "s"}],
        read_url=lambda u: pytest.fail("read_url should not be called"),
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("implant 2025?", context={})

    assert state["verified_answer"].startswith("Theo [RAG1]")
    assert len(state["reasoning_steps"]) == 3
    titles = {c.get("title") for c in state["retrieved_sources"]}
    assert titles == {"Implant book", "ADA 2025"}


@pytest.mark.asyncio
async def test_react_max_iterations_forces_synthesis():
    tool_step = json.dumps({"thought": "search again", "action": "rag_search", "action_input": "x"})
    # 5 tool calls, then one forced synthesis call that returns the final answer.
    steps = [tool_step] * 5 + ["Final synthesized answer."]
    runner = ReActRunner(
        llm=_llm_from_steps(steps),
        rag_search=lambda q: [{"title": "src", "snippet": "s", "content": "s", "source": "src"}],
        web_search=lambda q: [],
        read_url=lambda u: "",
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("deep question", context={})

    assert state["verified_answer"] == "Final synthesized answer."
    assert "max iterations" in " ".join(state["warnings"]).lower()
    assert len(state["reasoning_steps"]) == 5


@pytest.mark.asyncio
async def test_react_malformed_json_retries_once():
    steps = [
        "not json at all",  # malformed
        json.dumps({"thought": "ok now", "final_answer": "Done."}),  # retry
    ]
    runner = ReActRunner(
        llm=_llm_from_steps(steps),
        rag_search=lambda q: [],
        web_search=lambda q: [],
        read_url=lambda u: "",
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("x", context={})

    assert state["verified_answer"] == "Done."


@pytest.mark.asyncio
async def test_react_web_search_error_becomes_observation():
    seen_observations: List[str] = []

    def recording_llm(obs_list):
        steps = [
            json.dumps({"thought": "try web", "action": "web_search", "action_input": "x"}),
            json.dumps({"thought": "fallback", "final_answer": "ok"}),
        ]
        idx = {"i": 0}

        async def _llm(prompt: str) -> str:
            # Capture the prompt-visible observation on the second call.
            if idx["i"] == 1:
                obs_list.append(prompt)
            i = idx["i"]
            idx["i"] = i + 1
            return steps[i]

        return _llm

    def failing_web(q):
        raise WebSearchError("key missing")

    runner = ReActRunner(
        llm=recording_llm(seen_observations),
        rag_search=lambda q: [],
        web_search=failing_web,
        read_url=lambda u: "",
        verify=_identity_verify,
        max_iterations=5,
    )

    state = await runner.run("fresh info?", context={})

    assert state["verified_answer"] == "ok"
    assert any("WebSearchError" in prompt or "key missing" in prompt for prompt in seen_observations)


async def _identity_verify(state: Dict[str, Any]) -> Dict[str, Any]:
    """Passthrough verify stub used by tests."""
    state.setdefault("verified_answer", state.get("formatted_answer", ""))
    state.setdefault("confidence_score", 0.8)
    state.setdefault("warnings", [])
    return state
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_react_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agents.workflow.react_runner'`

- [ ] **Step 3: Write minimal implementation**

Create `agents/workflow/react_runner.py`:

```python
"""ReAct-style agent runner used when ``ChatRequest.mode == "agent"``.

Loops Reason → Act → Observe up to ``max_iterations`` times. Each iteration the
LLM returns a JSON step. The runner executes the requested tool, appends the
observation to the trajectory, and loops. On ``final_answer`` (or on reaching
the iteration cap) the runner synthesizes the answer and runs the existing
Verify stage so grounding and safety checks still apply.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

__all__ = ["ReActRunner"]

LLMCallable = Callable[[str], Awaitable[str]]
RagToolCallable = Callable[[str], List[Dict[str, Any]]]
WebToolCallable = Callable[[str], List[Dict[str, Any]]]
UrlToolCallable = Callable[[str], str]
VerifyCallable = Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]


_SYSTEM_PROMPT_TEMPLATE = """Bạn là một AI agent cho sinh viên nha khoa, chạy theo vòng lặp ReAct.

Mỗi bước bạn PHẢI trả về JSON hợp lệ theo một trong hai dạng sau:
1. Gọi tool: {{"thought": "...", "action": "<tool_name>", "action_input": "<string>"}}
2. Kết thúc: {{"thought": "...", "final_answer": "<câu trả lời tiếng Việt, có trích dẫn [RAG1], [WEB1]..."}}

TOOL CÓ SẴN:
{tools}

QUY TẮC:
- Dùng rag_search cho kiến thức giáo khoa (textbook, guideline nội bộ).
- Nếu web_search có sẵn, dùng cho thông tin cập nhật (recall, guideline mới).
- Dùng read_url khi một URL đáng tin cậy cần đọc kỹ hơn snippet.
- Không bịa nguồn. Trích dẫn [RAG<n>] cho RAG, [WEB<n>] cho web.
- Tối đa {max_iterations} bước. Khi đủ dữ liệu, trả final_answer.
"""

_TOOL_DESC_RAG = "- rag_search(query): tìm tài liệu trong corpus nội bộ."
_TOOL_DESC_WEB = "- web_search(query): tìm trên web (Tavily)."
_TOOL_DESC_URL = "- read_url(url): đọc nội dung một trang web (tối đa 8000 ký tự)."


class ReActRunner:
    """ReAct loop around rag_search / web_search / read_url tools."""

    def __init__(
        self,
        llm: LLMCallable,
        rag_search: RagToolCallable,
        web_search: Optional[WebToolCallable],
        read_url: Optional[UrlToolCallable],
        verify: VerifyCallable,
        max_iterations: Optional[int] = None,
    ) -> None:
        self._llm = llm
        self._rag_search = rag_search
        self._web_search = web_search
        self._read_url = read_url
        self._verify = verify
        self._max_iterations = _resolve_max_iterations(max_iterations)

    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the ReAct loop and return a workflow-state dict."""
        trajectory: List[Dict[str, Any]] = []
        reasoning_steps: List[str] = []
        retrieved_sources: List[Dict[str, Any]] = []
        warnings: List[str] = []
        final_answer: Optional[str] = None

        system_prompt = self._build_system_prompt()

        for step_idx in range(1, self._max_iterations + 1):
            prompt = _build_step_prompt(system_prompt, message, trajectory, context)
            step = await self._ask_for_step(prompt)

            if step is None:
                # Malformed twice in a row — skip this iteration.
                warnings.append(f"Bỏ qua bước {step_idx}: JSON không hợp lệ")
                reasoning_steps.append(f"🧭 Bước {step_idx} — <bỏ qua>")
                continue

            if "final_answer" in step and step["final_answer"]:
                final_answer = str(step["final_answer"])
                reasoning_steps.append(f"🧭 Bước {step_idx} — final_answer")
                trajectory.append(step)
                break

            action = str(step.get("action") or "").strip()
            action_input = str(step.get("action_input") or "").strip()
            observation, sources = self._run_tool(action, action_input)
            step["observation"] = observation
            trajectory.append(step)
            retrieved_sources.extend(sources)
            reasoning_steps.append(
                f"🧭 Bước {step_idx} — {action}({_shorten(action_input)})"
            )

        if final_answer is None:
            warnings.append("Đã đạt max iterations — ép tổng hợp câu trả lời.")
            final_answer = await self._force_synthesis(message, trajectory)

        state: Dict[str, Any] = {
            "user_input": message,
            "context": context,
            "formatted_answer": final_answer,
            "verified_answer": final_answer,
            "reasoning_steps": reasoning_steps,
            "retrieved_sources": retrieved_sources,
            "citations": [s.get("source") or s.get("title") or "" for s in retrieved_sources],
            "warnings": warnings,
            "confidence_score": 0.0,
        }
        return await self._verify(state)

    # ---- internals ----------------------------------------------------- #

    def _build_system_prompt(self) -> str:
        tools: List[str] = [_TOOL_DESC_RAG]
        if self._web_search is not None:
            tools.append(_TOOL_DESC_WEB)
        if self._read_url is not None:
            tools.append(_TOOL_DESC_URL)
        return _SYSTEM_PROMPT_TEMPLATE.format(
            tools="\n".join(tools),
            max_iterations=self._max_iterations,
        )

    async def _ask_for_step(self, prompt: str) -> Optional[Dict[str, Any]]:
        """Call the LLM, parse JSON, retry once on malformed output."""
        raw = await self._llm(prompt)
        parsed = _parse_step(raw)
        if parsed is not None:
            return parsed
        retry_prompt = prompt + (
            "\n\nLƯU Ý: Phản hồi trước không phải JSON hợp lệ. "
            "Hãy trả về JSON đúng schema đã mô tả."
        )
        raw_retry = await self._llm(retry_prompt)
        return _parse_step(raw_retry)

    def _run_tool(self, action: str, action_input: str):
        if action == "rag_search":
            try:
                hits = self._rag_search(action_input) or []
            except Exception as exc:
                return f"RAG error: {exc}", []
            text = _format_rag_observation(hits)
            return text, [_normalize_rag_hit(h) for h in hits]
        if action == "web_search":
            if self._web_search is None:
                return "web_search không khả dụng.", []
            try:
                hits = self._web_search(action_input) or []
            except Exception as exc:
                return f"WebSearchError: {exc}", []
            text = _format_web_observation(hits)
            return text, [_normalize_web_hit(h) for h in hits]
        if action == "read_url":
            if self._read_url is None:
                return "read_url không khả dụng.", []
            try:
                return self._read_url(action_input), []
            except Exception as exc:
                return f"UrlReadError: {exc}", []
        return f"Unknown action: {action!r}", []

    async def _force_synthesis(
        self, message: str, trajectory: List[Dict[str, Any]]
    ) -> str:
        prompt = (
            "Dựa trên trajectory bên dưới, hãy soạn câu trả lời cuối cùng "
            "bằng tiếng Việt, trích dẫn [RAG<n>] / [WEB<n>] nếu phù hợp.\n\n"
            f"CÂU HỎI: {message}\n\n"
            f"TRAJECTORY:\n{json.dumps(trajectory, ensure_ascii=False, indent=2)}"
        )
        return await self._llm(prompt)


# ---- helpers ----------------------------------------------------------- #


def _resolve_max_iterations(explicit: Optional[int]) -> int:
    if explicit is not None:
        return max(1, min(10, explicit))
    try:
        env_val = int(os.getenv("AGENT_MAX_ITERATIONS", "5"))
    except ValueError:
        env_val = 5
    return max(1, min(10, env_val))


def _parse_step(raw: str) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    # Trim leading/trailing code fences if present.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def _build_step_prompt(
    system_prompt: str,
    message: str,
    trajectory: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> str:
    history = (
        context.get("recent_history") if isinstance(context, dict) else None
    )
    history_block = f"\n\nNGỮ CẢNH:\n{history}\n" if history else ""
    traj_block = (
        json.dumps(trajectory, ensure_ascii=False, indent=2)
        if trajectory
        else "(chưa có bước nào)"
    )
    return (
        f"{system_prompt}{history_block}\n\nCÂU HỎI: {message}\n\n"
        f"TRAJECTORY HIỆN TẠI:\n{traj_block}\n\n"
        "Trả về đúng một JSON step tiếp theo."
    )


def _format_rag_observation(hits: List[Dict[str, Any]]) -> str:
    if not hits:
        return "RAG không có kết quả."
    parts: List[str] = []
    for i, hit in enumerate(hits, start=1):
        title = hit.get("title") or hit.get("source") or f"RAG{i}"
        snippet = hit.get("snippet") or hit.get("content") or ""
        parts.append(f"[RAG{i}] {title}\n{snippet}")
    return "\n\n".join(parts)


def _format_web_observation(hits: List[Dict[str, Any]]) -> str:
    if not hits:
        return "Web search không có kết quả."
    parts: List[str] = []
    for i, hit in enumerate(hits, start=1):
        title = hit.get("title") or hit.get("url") or f"WEB{i}"
        url = hit.get("url") or ""
        snippet = hit.get("snippet") or hit.get("content") or ""
        parts.append(f"[WEB{i}] {title}\nURL: {url}\n{snippet}")
    return "\n\n".join(parts)


def _normalize_rag_hit(hit: Dict[str, Any]) -> Dict[str, Any]:
    title = hit.get("title") or hit.get("source") or "RAG source"
    return {
        "title": title,
        "source": hit.get("source") or title,
        "snippet": hit.get("snippet") or hit.get("content") or "",
        "content": hit.get("content") or hit.get("snippet") or "",
    }


def _normalize_web_hit(hit: Dict[str, Any]) -> Dict[str, Any]:
    title = hit.get("title") or hit.get("url") or "Web source"
    return {
        "title": title,
        "source": hit.get("url") or title,
        "snippet": hit.get("snippet") or hit.get("content") or "",
        "content": hit.get("content") or hit.get("snippet") or "",
    }


def _shorten(text: str, limit: int = 40) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./venv/bin/pytest tests/test_react_runner.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add agents/workflow/react_runner.py tests/test_react_runner.py
git commit -m "feat(chat-mode): add ReActRunner with rag/web/read_url tools + verify"
```

---

## Task 7: Wire runners into `Services` and route in `api/chat.py`

**Files:**
- Modify: `api/deps.py:26-50, 94-98`
- Modify: `api/chat.py:66-194`
- Test: `tests/test_chat_mode_routing.py`

- [ ] **Step 1: Write the failing integration test**

Create `tests/test_chat_mode_routing.py`:

```python
"""Routing tests for POST /api/chat with mode="chat" / "agent" / unset."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from api.deps import services
from main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSION_DB_PATH", str(tmp_path / "sessions.db"))
    monkeypatch.setenv("MEMORY_DB_PATH", str(tmp_path / "memory.db"))
    monkeypatch.setenv("LEARNING_DB_PATH", str(tmp_path / "learning.db"))
    services._started = False
    services.startup()
    yield TestClient(app)
    services.shutdown()


class _RecordingRunner:
    def __init__(self, name: str):
        self.name = name
        self.calls: List[Dict[str, Any]] = []

    async def run(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        self.calls.append({"message": message, "context": context})
        return {
            "formatted_answer": f"{self.name} answer",
            "verified_answer": f"{self.name} answer",
            "reasoning_steps": [f"{self.name} step"],
            "citations": [],
            "retrieved_sources": [],
            "confidence_score": 0.8,
            "warnings": [],
        }


def _install_runners(monkeypatch):
    chat_runner = _RecordingRunner("chat")
    react_runner = _RecordingRunner("agent")
    monkeypatch.setattr(services, "chat_mode_runner", chat_runner, raising=False)
    monkeypatch.setattr(services, "react_runner", react_runner, raising=False)
    return chat_runner, react_runner


def test_mode_chat_invokes_chat_runner(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)
    resp = client.post(
        "/api/chat",
        json={"message": "web question", "user_id": "u1", "mode": "chat"},
    )
    assert resp.status_code == 200, resp.text
    assert len(chat_runner.calls) == 1
    assert len(react_runner.calls) == 0
    assert resp.json()["answer"] == "chat answer"


def test_mode_agent_invokes_react_runner(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)
    resp = client.post(
        "/api/chat",
        json={"message": "deep question", "user_id": "u2", "mode": "agent"},
    )
    assert resp.status_code == 200, resp.text
    assert len(react_runner.calls) == 1
    assert len(chat_runner.calls) == 0
    assert resp.json()["answer"] == "agent answer"


def test_mode_unset_defaults_to_agent(client, monkeypatch):
    chat_runner, react_runner = _install_runners(monkeypatch)
    resp = client.post(
        "/api/chat",
        json={"message": "no mode", "user_id": "u3"},
    )
    assert resp.status_code == 200, resp.text
    assert len(react_runner.calls) == 1
    assert len(chat_runner.calls) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./venv/bin/pytest tests/test_chat_mode_routing.py -v`
Expected: FAIL — `services` has no `chat_mode_runner` / `react_runner`, or routing in `_run_chat` ignores mode.

- [ ] **Step 3: Wire runners into Services**

In `api/deps.py`, add fields to `Services.__init__` next to the existing `reasoning_workflow` field (near line 41):

```python
        self.reasoning_workflow: Any = None
        self.guardrail_runner: Any = None
        self.chat_mode_runner: Any = None
        self.react_runner: Any = None
        self.ingestion_pipeline: Any = None
```

Then in `Services.startup()` after the line `self.guardrail_runner = guardrail_runner` (near line 98), add:

```python
        # Chat/Agent mode runners (replace one-shot reasoning_workflow when
        # the client passes ChatRequest.mode = "chat" / "agent").
        from agents.workflow.chat_mode import ChatModeRunner
        from agents.workflow.react_runner import ReActRunner
        from tools.medical_search import retrieve as rag_retrieve
        from tools.web_search import tavily_search
        from tools.url_reader import read_url as url_reader

        self.chat_mode_runner = ChatModeRunner()

        async def _verify_only(state: Dict[str, Any]) -> Dict[str, Any]:
            from agents.workflow.verify_node import verify_node

            return await verify_node(state)

        web_search_tool = tavily_search if os.getenv("TAVILY_API_KEY") else None
        self.react_runner = ReActRunner(
            llm=_react_llm_adapter(),
            rag_search=lambda q: rag_retrieve(q, top_k=5),
            web_search=web_search_tool,
            read_url=url_reader,
            verify=_verify_only,
        )
```

And add this helper at the module level (above or below `services = Services()`):

```python
def _react_llm_adapter():
    """Return an async LLM callable (prompt -> text) backed by the primary model."""
    from agents.model_config import get_primary_model

    model = get_primary_model()

    async def _call(prompt: str) -> str:
        try:
            resp = await model.generate_async(prompt)
        except AttributeError:
            resp = model.generate(prompt)
        return str(resp)

    return _call
```

- [ ] **Step 4: Route by mode in `api/chat.py`**

In `api/chat.py`, replace the "5. Run the reasoning workflow" section inside `_run_chat` (around line 120-130). Change:

```python
    # 5. Run the reasoning workflow.
    state = await svc.reasoning_workflow.run(request.message, context)
```

to:

```python
    # 5. Run the mode-specific runner.
    if request.mode == "chat":
        state = await svc.chat_mode_runner.run(request.message, context)
    else:
        state = await svc.react_runner.run(request.message, context)
```

No other code in `_run_chat` changes — guardrail post-checks and persistence stay as-is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `./venv/bin/pytest tests/test_chat_mode_routing.py tests/test_chat_request_mode.py -v`
Expected: 7 passed total

- [ ] **Step 6: Run full backend test suite to check no regression**

Run: `./venv/bin/pytest tests/ -x -q`
Expected: all previously passing tests still pass; new ones also pass.

- [ ] **Step 7: Commit**

```bash
git add api/deps.py api/chat.py tests/test_chat_mode_routing.py
git commit -m "feat(chat-mode): wire ChatMode/ReAct runners and route by request.mode"
```

---

## Task 8: Frontend type + API-client `mode` plumbing

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts:65-84`

- [ ] **Step 1: Add the ChatMode type**

In `frontend/src/lib/types.ts`, append (keep existing content intact):

```typescript
export type ChatMode = "chat" | "agent";
```

- [ ] **Step 2: Thread `mode` through `sendMessage`**

In `frontend/src/lib/api.ts`:

Add `ChatMode` to the type-import block:

```typescript
import type {
  Citation,
  ChatMode,
  FeedbackPayload,
  MedicalDocument,
  Quiz,
  QuizDifficulty,
  QuizResult,
  UploadResponse,
} from "./types";
```

Replace the `sendMessage` function body with:

```typescript
/** Send a message to the backend and receive a response. */
export async function sendMessage(
  message: string,
  userId: string,
  sessionId?: string,
  mode?: ChatMode,
): Promise<AssistantReply> {
  if (USE_MOCK_API) return buildMockReply(message);

  const res = await apiFetch(`${config.apiBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      user_id: userId,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(mode ? { mode } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  return (await res.json()) as AssistantReply;
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat(chat-mode): thread optional mode through sendMessage"
```

---

## Task 9: `ChatModeToggle` component

**Files:**
- Create: `frontend/src/components/chat/ChatModeToggle.tsx`
- Test: `frontend/src/components/chat/ChatModeToggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/chat/ChatModeToggle.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ChatModeToggle } from "./ChatModeToggle";

describe("ChatModeToggle", () => {
  it("renders both pills and marks the active one with aria-pressed", () => {
    render(<ChatModeToggle value="chat" onChange={() => {}} />);

    const chatPill = screen.getByRole("button", { name: /Chat/ });
    const agentPill = screen.getByRole("button", { name: /Agent/ });

    expect(chatPill).toHaveAttribute("aria-pressed", "true");
    expect(agentPill).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onChange with the opposite mode when a pill is clicked", () => {
    const onChange = vi.fn();
    render(<ChatModeToggle value="chat" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Agent/ }));
    expect(onChange).toHaveBeenCalledWith("agent");

    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    // Already active, still fires but with same value — UI stays simple.
    expect(onChange).toHaveBeenCalledWith("chat");
  });

  it("each pill is at least 44px tall for touch accessibility", () => {
    render(<ChatModeToggle value="chat" onChange={() => {}} />);
    for (const pill of screen.getAllByRole("button")) {
      expect(pill.className).toContain("min-h-[44px]");
    }
  });

  it("shows a hint when Agent is selected", () => {
    const { rerender } = render(
      <ChatModeToggle value="chat" onChange={() => {}} />,
    );
    expect(screen.queryByText(/phân tích sâu/i)).toBeNull();

    rerender(<ChatModeToggle value="agent" onChange={() => {}} />);
    expect(screen.getByText(/phân tích sâu/i)).toBeInTheDocument();
  });

  it("disables both pills when disabled=true", () => {
    render(<ChatModeToggle value="chat" onChange={() => {}} disabled />);
    for (const pill of screen.getAllByRole("button")) {
      expect(pill).toBeDisabled();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/chat/ChatModeToggle.test.tsx`
Expected: FAIL — module `./ChatModeToggle` not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/chat/ChatModeToggle.tsx`:

```tsx
"use client";

import { Sparkles, Workflow } from "lucide-react";

import type { ChatMode } from "@/lib/types";

interface ChatModeToggleProps {
  value: ChatMode;
  onChange: (next: ChatMode) => void;
  disabled?: boolean;
}

const PILL_BASE =
  "inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";

export function ChatModeToggle({
  value,
  onChange,
  disabled = false,
}: ChatModeToggleProps) {
  const isChat = value === "chat";

  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label="Chọn chế độ trả lời"
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1"
      >
        <button
          type="button"
          aria-pressed={isChat}
          disabled={disabled}
          onClick={() => onChange("chat")}
          className={`${PILL_BASE} ${
            isChat
              ? "bg-primary text-white shadow-sm"
              : "text-slate-500 hover:bg-white"
          }`}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Chat
        </button>
        <button
          type="button"
          aria-pressed={!isChat}
          disabled={disabled}
          onClick={() => onChange("agent")}
          className={`${PILL_BASE} ${
            !isChat
              ? "bg-primary text-white shadow-sm"
              : "text-slate-500 hover:bg-white"
          }`}
        >
          <Workflow className="h-4 w-4" aria-hidden />
          Agent
        </button>
      </div>
      {!isChat && (
        <span className="text-xs text-slate-500">
          Chậm hơn, phân tích sâu — chạy nhiều bước tra cứu.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/chat/ChatModeToggle.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ChatModeToggle.tsx frontend/src/components/chat/ChatModeToggle.test.tsx
git commit -m "feat(chat-mode): add ChatModeToggle segmented control"
```

---

## Task 10: Mount the toggle in `ChatInterface`

**Files:**
- Modify: `frontend/src/components/chat/ChatInterface.tsx`
- Modify: `frontend/src/components/chat/ChatInterface.test.tsx`

- [ ] **Step 1: Write the failing test additions**

In `frontend/src/components/chat/ChatInterface.test.tsx`, read the file first to locate the existing "sends a message" test, then:

1. Extend the existing send-message test to also assert the request body includes `mode: "chat"` (the frontend default).
2. Add a new test that:
   - Renders `<ChatInterface>` logged in.
   - Clicks the Agent pill.
   - Types a message and sends.
   - Asserts the next POST body includes `mode: "agent"`.

Use the file's existing `fetch`-mocking pattern. Representative skeleton (adapt to the file's existing style):

```typescript
it("sends mode=chat by default when a message is submitted", async () => {
  // ... existing render + submit flow ...
  const body = JSON.parse((fetchMock.mock.calls.at(-1)?.[1]?.body as string) ?? "{}");
  expect(body.mode).toBe("chat");
});

it("sends mode=agent after clicking the Agent pill", async () => {
  // ... render ...
  fireEvent.click(screen.getByRole("button", { name: /Agent/ }));
  // ... type + submit ...
  const body = JSON.parse((fetchMock.mock.calls.at(-1)?.[1]?.body as string) ?? "{}");
  expect(body.mode).toBe("agent");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/chat/ChatInterface.test.tsx`
Expected: the two new/updated tests FAIL because `ChatInterface` does not yet render the toggle or pass `mode`.

- [ ] **Step 3: Add state + render in `ChatInterface.tsx`**

In `frontend/src/components/chat/ChatInterface.tsx`:

1. Add import at the top with the other local imports:

```tsx
import { ChatModeToggle } from "./ChatModeToggle";
import type { ChatMode } from "@/lib/types";
```

2. Inside the component body, next to the other `useState` hooks, add:

```tsx
const [mode, setMode] = useState<ChatMode>("chat");
```

3. In `handleSend` (around line 198), update the `sendMessage` call to pass the current mode:

```tsx
const reply = await sendMessage(
  trimmed,
  userId,
  sessionId ?? undefined,
  mode,
);
```

4. In the JSX for the chat input area (around line 437, right above `<textarea>`), insert the toggle. The input is wrapped in a container — add the toggle as its first child so it sits above the textarea:

```tsx
<div className="mb-2 flex items-center justify-between">
  <ChatModeToggle
    value={mode}
    onChange={setMode}
    disabled={isThinking}
  />
</div>
<textarea
  ref={textareaRef}
  ...
```

(Adjust the exact JSX wrapping to match the file's current structure — the key is that `ChatModeToggle` renders inside the same container that holds the textarea + Send button, above the textarea.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/chat/ChatInterface.test.tsx`
Expected: all tests pass (previously-passing ones unchanged, two new ones green).

- [ ] **Step 5: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/ChatInterface.tsx frontend/src/components/chat/ChatInterface.test.tsx
git commit -m "feat(chat-mode): mount ChatModeToggle in ChatInterface (default chat)"
```

---

## Task 11: Manual E2E smoke test

**Files:** none (manual verification).

- [ ] **Step 1: Set env vars**

Ensure `.env` has `TAVILY_API_KEY=<real key>` and `AGENT_MAX_ITERATIONS=5`. Confirm `APP_ENV=development`.

- [ ] **Step 2: Start backend**

Run: `./venv/bin/uvicorn main:app --reload --port 8000`
Expected: `Application startup complete.` with no errors; `/health` returns `status: "healthy"`.

- [ ] **Step 3: Start frontend**

Run: `cd frontend && npm run dev`
Expected: Next.js dev server up on `http://localhost:3000`.

- [ ] **Step 4: Verify Chat mode E2E**

Open `http://localhost:3000`, log in, open a chat.
- Verify the mode toggle is visible above the textarea with **Chat** active by default.
- Send: "ADA guideline mới nhất về composite?"
- Expected: Response arrives within ~5-10s; `reasoning_steps` shows "🌐 Tìm kiếm web (Tavily, N kết quả)"; citations list URLs; no stack trace in backend logs.

- [ ] **Step 5: Verify Agent mode E2E**

Click the **Agent** pill. The hint "Chậm hơn, phân tích sâu" appears.
- Send: "So sánh implant one-piece và two-piece dựa trên guideline mới nhất và tài liệu nội bộ."
- Expected: Response arrives within ~20-60s; `reasoning_steps` lists multiple "🧭 Bước N — <tool>(...)" entries; citations mix PDF/book titles with URLs; no stack trace.

- [ ] **Step 6: Verify Tavily-unavailable fallback**

Temporarily unset `TAVILY_API_KEY` and restart backend.
- Chat mode: response includes "Tạm thời không thể tìm kiếm web"; `warnings` lists `WebSearchError`.
- Agent mode: still responds using only `rag_search` + `read_url`; backend logs show the system prompt omits `web_search`.

- [ ] **Step 7: Document any surprises**

If anything fails, open an issue with repro steps. Otherwise mark the task done.

---

## Self-review checklist (post-write)

Verified during authoring:
- Spec coverage: all 11 items from `docs/superpowers/specs/2026-10-01-chat-agent-mode-toggle-design.md` map to tasks (Chat runner → T5, ReAct runner → T6, mode field → T4, API routing → T7, FE toggle → T9/T10, deps/env → T1, web search → T2, URL reader → T3, FE type → T8, manual E2E → T11).
- No `TBD`/`TODO`/placeholder language — every code step shows literal content.
- Type/method names consistent across tasks (`ChatModeRunner.run`, `ReActRunner.run`, `services.chat_mode_runner`, `services.react_runner`, `ChatRequest.mode`, `ChatMode`, `ChatModeToggle`).
- Each code step shows the full code; file paths are exact with line hints where helpful.
