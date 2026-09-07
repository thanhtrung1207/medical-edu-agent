# Persistent Learning Memory Design

## Goal

Make the dental education agent preserve only useful learning facts across conversations on the same browser. A new conversation must use prior facts only when they are relevant to the current dental topic. Users must be able to inspect and delete everything stored for their browser identity.

## Scope

This design covers the Python API and memory layer, the Next.js chat client, and automated tests. It keeps SQLite as the persistence layer and does not add authentication, cloud synchronization, vector search, or transcript retention.

## Decisions

- The browser generates a UUID v4 once and stores it as `medical-edu-agent.user-id` in `localStorage`.
- The chat client sends this identifier in every request. `user_id` is required by the API and must be a non-empty value of at most 128 characters.
- Standard chat always calls the backend. Browser-held API keys must not bypass session persistence or learning-memory behavior.
- A session represents one conversation only. The active session ID is retained for page refreshes; starting a new conversation clears it so the API creates a new session for the same user ID.
- Long-term memory contains only learning facts: `learning_goal`, `preference`, `weak_area`, `topic_interest`, and `bookmark`.
- Raw chat transcripts, medical history, personal data, and inferred facts are never added to long-term memory.
- SQLite remains the source of truth. The design reuses the existing `memories` table and its unique `(user_id, memory_type, key)` constraint.

## Architecture

### Identity and sessions

The frontend owns the anonymous device identity. It must create the persistent UUID before the first chat request and include it with the active `session_id` when one exists. Requests with a missing or invalid user ID are rejected instead of falling back to `anonymous`.

`SessionManager` continues to store messages by session ID. When a request supplies a session ID, the chat endpoint must verify that its owner equals the request user ID; an unknown or non-owned session returns `404`. The chat endpoint creates a session only when no session ID is supplied. Session history is used only for the active conversation, and its history endpoint applies the same ownership check. A new conversation has an empty history even though it shares the same user ID.

### Learning-memory lifecycle

Memory is written only from explicit learning signals:

- An explicit goal or preference in a user message.
- An explicit bookmark action.
- A verified learning event, such as an incorrect quiz answer, that updates a weak area.

A fact is persisted only when it can be assigned one current taxonomy label: `Răng vỡ`, `Mất răng`, `Phục hình`, `Implant`, `Nha chu`, `Nội nha`, `Chỉnh nha`, or `Phẫu thuật`. A signal without one of these topics is not persisted. Each write uses a stable key within its memory type: `weak_area` and `topic_interest` use the topic name, `learning_goal` uses `goal:{topic}`, `preference` uses `preference:{topic}:{name}`, and `bookmark` uses its message ID. A repeat write updates the value, confidence, and timestamp rather than creating a duplicate. Stored values are compact JSON objects containing the normalized learning fact and its topic.

Existing `MemoryStore` methods remain responsible for persistence. A non-destructive schema migration creates `idx_memories_user_updated` on `(user_id, updated_at DESC)` if absent. Existing data is retained; records owned by the legacy `anonymous` identity are not exposed to newly generated browser identities.

### Context construction

For every non-blocked chat request, the backend persists the user message, detects the current topic, and loads the recent messages for the active session. It then loads only that user's learning memories.

A memory is eligible only when its stored topic exactly equals the detected taxonomy topic. If no current topic is detected, or no memory is eligible, the long-term-memory section is omitted entirely. The agent must not inject a generic profile, goal, or preference merely because it exists.

Eligible entries are ordered by confidence, then most recent update. The builder passes at most five entries and 1,500 total characters of long-term memory to the prompt. The active session's recent history remains independently bounded by the existing history limit.

No embeddings or semantic vector retrieval are introduced in this phase. Topic matching is deterministic, inspectable, and covered by unit tests.

## API contract

### Chat request

`POST /api/chat` continues to accept `message`, optional `session_id`, and `stream`. Its `user_id` field becomes required. The response continues to return the resolved `session_id` so the client can retain it.

### Memory management

Add user-scoped endpoints:

- `GET /api/memories?user_id={user_id}` returns all memory entries belonging to that identity, ordered by newest update. Each result includes `id`, `memory_type`, `key`, parsed `value`, `confidence`, `created_at`, and `updated_at`.
- `DELETE /api/memories/{memory_id}?user_id={user_id}` deletes one entry only when it belongs to that identity. A missing or non-owned entry returns `404` without exposing its contents.
- `DELETE /api/memories?user_id={user_id}` deletes every entry for that identity and returns the deletion count.

The API does not accept a request that deletes by memory ID alone. It always scopes reads and deletes to the caller's user ID.

## Frontend behavior

The chat client initializes the persistent user ID before sending a message. It retains the active session ID locally so refreshing the page continues the same conversation. The "New conversation" action clears only the active session ID; it must not clear the user ID or learning memories.

Settings display the current user's learning memories as type, topic/key, summary, and updated time. The view provides a delete action for each entry and a destructive "Delete all learning memory" action. It does not show previous transcript content.

If local storage is cleared, the next visit receives a new identity and cannot retrieve the old local memory. The generated ID provides device-scoped separation, not authentication: a client that deliberately supplies another known ID can impersonate it. Cross-device access and authenticated authorization are explicitly out of scope until authentication is introduced.

## Failure handling and privacy

Memory retrieval and persistence are best effort. A database failure produces a normal chat response with no long-term-memory context and logs only the technical failure category and opaque identifiers. It must never log a memory value, prompt, or transcript.

Invalid request identity is a validation error. An unavailable memory-management operation returns a standard API error and leaves unrelated memory untouched. The chat response never reveals whether another user ID owns a memory entry.

## Verification

Automated tests must prove all of the following:

1. Two turns in one session include the earlier active-session message.
2. A new session with the same user ID retrieves a relevant learning memory.
3. A new session does not inject a memory from an unrelated dental topic.
4. Two distinct browser user IDs cannot read, retrieve, or delete each other's memories.
5. An explicit learning fact is upserted rather than duplicated.
6. A single-memory delete and delete-all remove only the requesting user's entries.
7. Restarting the backend preserves SQLite memory and session data.
8. A memory-store failure does not fail an otherwise valid chat request.
9. The frontend persists the user ID, reuses the active session after refresh, and starts a fresh session without discarding memory.

## Acceptance criteria

- The default `anonymous` user ID is removed from the chat contract.
- Starting a new conversation for the same browser retains relevant learning facts across backend restarts.
- An unrelated question receives no long-term-memory injection.
- Users can list, delete one, and delete all of their stored learning memories.
- No raw transcript, local `.env` file, database file, embedding index, or generated tool state is committed to Git.
- The backend and frontend tests covering this feature pass.
