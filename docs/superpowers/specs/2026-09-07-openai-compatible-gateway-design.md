# OpenAI-Compatible Gateway Integration Design

## Goal

Allow the medical-education agent to use an OpenAI-compatible model gateway as its primary provider while retaining Gemini as the existing fallback. The gateway credential remains local-only and is never committed, logged, or embedded in source code.

## Scope

This change affects only model selection and configuration. It does not change the Confirm → Think → Answer → Verify workflow, RAG retrieval, guardrails, embeddings, or the existing Claude provider.

The supplied gateway API key is considered compromised because it was shared in chat. It must be revoked or rotated before any live request. The replacement key is entered only in the developer's ignored local `.env` file.

## Configuration Contract

The selected provider remains controlled by `PRIMARY_PROVIDER`.

```dotenv
PRIMARY_PROVIDER=gateway
GATEWAY_BASE_URL=https://gateway.example/v1
GATEWAY_API_KEY=replace_with_rotated_local_key
GATEWAY_MODEL=provider_model_id
GEMINI_MODEL=gemini-2.5-flash
```

`.env.example` documents the three gateway variables using placeholders only. `.env` is already ignored by git.

A gateway configuration is usable only when all three gateway variables are non-empty. `GATEWAY_BASE_URL` is normalized so a trailing slash does not create a malformed OpenAI-compatible endpoint.

## Provider Selection

`agents/model_config.py` remains the sole provider-selection boundary.

- `PRIMARY_PROVIDER=claude` preserves existing Claude-via-LiteLLM behavior.
- `PRIMARY_PROVIDER=gateway` creates a LiteLLM OpenAI-compatible client using the configured gateway base URL, API key, and gateway model ID.
- Any unsupported provider, incomplete gateway configuration, or LiteLLM initialization failure returns the current Gemini model.
- `get_fallback_model()` continues returning Gemini.
- `has_distinct_fallback()` treats an initialized gateway LiteLLM client as distinct from Gemini.

The selected gateway model ID is opaque configuration. The application does not claim that a model is free or supported until the gateway catalog and a minimal completion request have succeeded.

## Security and Operational Boundaries

- The API key is read only from `GATEWAY_API_KEY`; it is never copied into source files, examples, tests, logs, exception text, or responses.
- Startup does not query `/models`, make a completion request, or automatically select a gateway model.
- Model discovery is an explicit manual maintenance action after the key is rotated and stored in local `.env`. The operator selects a catalog model ID and sets `GATEWAY_MODEL` before restarting the backend.
- Gateway failure at model initialization falls back to Gemini. A request-time provider error continues through the existing runtime fallback path; this change does not add a retry router or silently change model selection per turn.
- The gateway must be trusted with user prompts and retrieved medical educational passages. It is not an "agent" in this architecture; ADK workflow nodes remain the agents, and the gateway supplies their LLM backend.

## Testing

Unit tests must monkeypatch the LiteLLM constructor and environment, with no network calls and no real credentials. They verify:

1. Complete `gateway` configuration produces a LiteLLM client with the configured model and base URL.
2. Missing key, model, or base URL falls back to Gemini.
3. Gateway-client construction failure falls back to Gemini without exposing secret values.
4. Claude and Gemini selection remain unchanged.
5. The fallback model remains Gemini and is distinct when gateway is primary.

Manual verification after the key rotation uses the gateway catalog to select a concrete model ID, starts the backend with `PRIMARY_PROVIDER=gateway`, and sends one educational chat request. The response must succeed through the normal workflow; a startup configuration failure must visibly fall back to Gemini without exposing the gateway credential.

## Out of Scope

- Adding a gateway key to repository files or CI secrets.
- Automatically choosing models labeled "free" by the gateway.
- Per-node routing across different gateway models.
- Replacing Gemini fallback.
- Altering medical safety or hallucination guardrails.
- Repairing the existing canonical-index/live sample-case verification task, which remains separate.
