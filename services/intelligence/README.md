# MichaelOS Intelligence

Michael's AI engine: the system instruction, the model providers (Gemini, Ollama), the tool-use loop and its
limits, and the output guards (figure containment, write-claim review). Python is the single home for AI logic
in MichaelOS (`CLAUDE.md` §10).

The service **holds no credentials and reads no data**. The Next.js chat route drives each turn through
`POST /v1/agent/step`; when the model asks for a tool, the step returns `execute`, Next.js runs that tool inside
the user's own authenticated request (same Zod schema, executor and domain services as before) and sends the
outcome back. Architecture and rationale: `docs/architecture/michael-intelligence.md` §B.1–B.2.

## Install

Python 3.12 or 3.13. From the repository root:

```sh
python3.13 -m venv services/intelligence/.venv
services/intelligence/.venv/bin/pip install -r services/intelligence/requirements.lock
services/intelligence/.venv/bin/pip install -e 'services/intelligence[test]' --no-deps
```

## Configure

Copy `.env.example` to `services/intelligence/.env` (git-ignored). Generate one random token of at least 32
characters and set it as `INTELLIGENCE_SERVICE_TOKEN` here **and** in the Next.js `.env.local`, together with
`INTELLIGENCE_SERVICE_URL=http://127.0.0.1:8100`. Keep `AI_PROVIDER` (and the Gemini or Ollama settings) the
same on both sides: the Next.js server tells users which provider processes their messages, and this service
refuses a turn whose expected provider differs from its own.

| Variable | Meaning |
| --- | --- |
| `INTELLIGENCE_SERVICE_TOKEN` | Shared bearer secret, ≥ 32 characters. Missing → every step is refused (503). |
| `INTELLIGENCE_ENV` | `production` refuses Ollama and Gemini's unpaid tier. Default `development`. |
| `AI_PROVIDER` | `gemini` or `ollama`. |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_DATA_TIER` | As in the Next.js config. The unpaid tier requires the user's acknowledgement on every turn. |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local model, development only. |
| `AI_MAX_TOOL_CALLS`, `AI_MAX_ITERATIONS`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_OUTPUT_CHARS` | Turn limits; same names, defaults and bounds as before. |
| `MICHAELOS_SHARED_DIR` | Optional; where `shared/` lives if not at the repository root (deployment). |

## Run

```sh
services/intelligence/.venv/bin/uvicorn app.main:app --app-dir services/intelligence \
  --host 127.0.0.1 --port 8100 --env-file services/intelligence/.env
```

Then start Next.js with `AI_RUNTIME=python` to route chat through it (`AI_RUNTIME=python npm run dev`). Without
it, chat keeps using the TypeScript engine and this service is not called. Bind to loopback or a private
network only; it has no browser-facing surface (`/docs` and `/openapi.json` are disabled).

- `GET /health` — process is up.
- `GET /ready` — token configured, tool catalog loaded, provider configuration valid (no secrets returned).
- `POST /v1/agent/step` — bearer-authenticated; the contract is `app/api/models.py`, mirrored in
  `src/lib/intelligence-protocol.ts`.

## Test

```sh
npm run test:intelligence          # unit, contract, provider and parity tests (part of npm run verify)
npm run test:intelligence-smoke    # end to end: needs this service, `AI_RUNTIME=python npm run dev` and a model
```

The provider tests use a mocked HTTP transport: no network, no quota. `tests/test_parity.py` checks this
engine against `shared/ai/parity-fixtures.json`, which is generated from the TypeScript engine; while both
engines exist they must agree.

## Rollback

Unset `AI_RUNTIME` (or set it to `typescript`) and restart Next.js. No data or schema depends on this service.
