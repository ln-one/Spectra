# Spectra Agent Guide

> This file is the repository entry contract for AI coding agents working in Spectra.
> It is not a replacement for the full docs tree. It tells an agent what to trust,
> what to avoid, how to modify the system safely, and how to validate changes.

## 1. Purpose

Spectra is not a one-shot slide generator.

It is a recursive teaching and knowledge co-creation system in which:

- `Project` is the long-lived knowledge space
- `Session` is a local working unfolding
- `Artifact` is an externalized result
- `Version` is a formal anchor of state
- `CandidateChange` is an entrance for evolution
- `Reference` allows one space to condition another

The system must preserve the loop:

- upload and conversation accumulate context
- generation creates artifacts
- artifacts can return to the library
- history, failures, events, and outputs are part of the formal system language

If a change improves a local module but weakens this loop, it is the wrong change.

## 2. Read This First

Before editing code, read these in order:

1. [docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md](/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md)
2. [docs/project/README.md](/Users/ln1/Projects/Spectra/docs/project/README.md)
3. [docs/project/requirements.md](/Users/ln1/Projects/Spectra/docs/project/requirements.md)
4. [docs/standards/backend.md](/Users/ln1/Projects/Spectra/docs/standards/backend.md)
5. [docs/standards/AI_COLLABORATION.md](/Users/ln1/Projects/Spectra/docs/standards/AI_COLLABORATION.md)
6. [docs/CONTRIBUTING.md](/Users/ln1/Projects/Spectra/docs/CONTRIBUTING.md)

For product behavior and current surface semantics, also inspect:

- [docs/project/卡片功能.md](/Users/ln1/Projects/Spectra/docs/project/卡片功能.md)
- [docs/project/D_CONTRACT_V1.md](/Users/ln1/Projects/Spectra/docs/project/D_CONTRACT_V1.md)
- [docs/project/D8_MODEL_ROUTER_STRATEGY_V1.md](/Users/ln1/Projects/Spectra/docs/project/D8_MODEL_ROUTER_STRATEGY_V1.md)

For actual implementation truth, inspect live code and tests.

## 3. Many Docs Are Stale: How To Interpret Them

This repository contains active docs, planning docs, historical docs, and compatibility entry docs.
Do not treat every markdown file as equally authoritative.

### 3.1 Canonical priority

Use this trust order:

1. Live code that is covered by passing tests
2. Canonical philosophy and standards docs
3. OpenAPI contracts and runtime behavior
4. Active design references in `docs/project`
5. Historical notes and archived documents

### 3.2 Stale-doc rules

When a document and the code disagree:

- First ask whether the document is target-state design or historical context.
- If the doc is clearly target-state and the code is lagging, move code toward the doc.
- If the doc is clearly historical or contradicted by current tested behavior, do not force code backward.
- If unclear, choose the most conservative and maintainable interpretation, then leave the system more explicit than before.

### 3.3 Compatibility-entry docs

Some docs exist mainly as redirect or compatibility entry points.

Example:

- [docs/project/tech-stack.md](/Users/ln1/Projects/Spectra/docs/project/tech-stack.md) is not the live source of truth.
- The actual tech stack entry is [docs/architecture/tech-stack.md](/Users/ln1/Projects/Spectra/docs/architecture/tech-stack.md).

### 3.4 Historical docs

Anything under archived folders or clearly marked as historical is context, not command.

If you use a historical doc:

- say so in your reasoning
- verify against current code before changing behavior

## 4. Core Architectural Invariants

These are not optional.

1. Shared semantics must have a single authoritative source.
2. Runtime states, failure reasons, and session events are first-class contract data.
3. Output is not a dead end; output may return as future input.
4. `Project / Session / Artifact / Version / CandidateChange / Reference` must remain legible and linked.
5. Surface behavior and backend semantics must use the same language.
6. Small, explicit modules are preferred over clever abstractions.
7. Local fixes must not create hidden semantic forks.

## 5. Current End-to-End Pipelines

Agents must understand the full pipeline before changing local pieces.

### 5.1 Upload and RAG pipeline

`upload -> parse -> normalize -> chunk -> embedding -> index -> retrieval`

Relevant areas:

- `backend/services/file_upload_service/`
- `backend/services/media/`
- `backend/services/rag_service/`
- `backend/routers/files.py`

Important reality:

- text retrieval should use `text-embedding-v4`
- multimodal embedding should use `qwen3-vl-embedding`
- remote embedding failures must not silently degrade into opaque slowness

### 5.2 Chat pipeline

`project/session check -> user message persist -> history load + RAG load -> prompt build -> AI generate -> assistant persist`

Relevant areas:

- `backend/routers/chat/`
- `backend/services/ai/`
- `backend/services/prompt_service/`

Important reality:

- model choice must come from environment/config, not hidden hardcoding
- `CHAT_RAG_TIMEOUT_SECONDS` exists to stop RAG from freezing chat
- observability must show whether delay is in RAG or generation

### 5.3 Generation pipeline

`session bootstrap -> draft outline -> confirm outline -> generate content -> render -> persist artifact -> preview/download`

Relevant areas:

- `backend/services/generation_session_service/`
- `backend/services/courseware_ai/`
- `backend/services/task_executor/`
- `backend/services/artifact_generator/`
- `backend/routers/generate_sessions/`

Important reality:

- generation outputs must land as project-space artifacts
- session URLs should point to artifact download semantics, not ad hoc preview text exports
- `pptx` generation uses Marp CLI in the rendering path
- `docx` generation uses Pandoc in the rendering path

### 5.4 Queue and execution pipeline

`API/service dispatch -> RQ enqueue -> worker execute -> session event update -> terminal state sync`

Relevant areas:

- `backend/services/task_queue/`
- `backend/worker.py`
- `backend/services/task_executor/`
- `backend/services/platform/task_recovery.py`

Important reality:

- queue execution is the primary path
- `local_async` is a fallback, not the normal design
- only fresh workers count as available workers

## 6. Editing Rules

### 6.1 Respect layers

Backend layering standard is:

`router -> application service -> domain/data`

That means:

- `router` handles auth, request parsing, calling services, response shaping
- `router` should not host multi-step business orchestration
- `service` handles orchestration, external calls, state semantics, retry/fallback behavior
- storage and DB access stay behind service/data boundaries

### 6.2 Prefer folder-as-module

Follow [docs/standards/backend.md](/Users/ln1/Projects/Spectra/docs/standards/backend.md):

- `>300` lines: review for single responsibility
- `>500` lines: split by default
- `>800` lines: priority refactor

Do not keep adding logic to already-warned files unless the change is trivial or emergency-only.

### 6.3 Do not introduce hidden compatibility forks

Avoid:

- duplicate state vocabularies
- duplicate output URL semantics
- duplicate model selection logic
- duplicate queue worker health logic
- duplicate artifact persistence semantics

If a concept already has a helper or canonical module, use it.

## 7. State, Contract, and Output Rules

### 7.1 State is contract

`state`, `stateReason`, `errorCode`, `errorMessage`, `retryable`, `cursor`, and session events are contract data.

Do not treat them as incidental logs.

### 7.2 Success and failure must be explicit

For generation sessions:

- terminal success should resolve to a success state and terminal reason
- failure should include a meaningful failure reason and error code
- event payload and persisted session state must agree

### 7.3 Artifact semantics

If a session says a PPT or Word result exists:

- the URL should resolve through the project artifact download contract
- the artifact entity, session field, and output payload should agree

### 7.4 Preview semantics

Preview is not the same thing as final binary download.

Do not collapse:

- preview/export text-like content
- final artifact binary download

## 8. AI, Model, and Provider Rules

1. Model selection must follow environment configuration.
2. Do not hardcode active provider choice in code when config already exists.
3. Router policy may choose small vs large model, but must still respect configured provider/model values.
4. If provider failure occurs, preserve observability:
   - attempted model
   - provider
   - failure type
5. Do not silently swap semantics just to make one request pass.

Known real-world pitfalls:

- Docker config may accidentally override `.env` model choice
- MiniMax requires the correct API base for the active key/account
- embedding misconfiguration can degrade into slow local fallback

## 9. Rendering and Toolchain Rules

Spectra does not render PPT/Word by arbitrary ad hoc conversion.

Current practical rendering chain:

- PPT path: Marp CLI based rendering flow
- Word path: Pandoc based rendering flow

Do not replace or bypass these locally without checking the full generation chain, health checks, and deployment assumptions.

If generation seems broken, distinguish:

1. AI/content generation issue
2. render toolchain issue
3. artifact persistence issue
4. preview/download contract issue

## 10. Deployment and Runtime Rules

This project is moving toward cloud-friendly container deployment.

Prefer:

- env-driven config
- stateless app behavior where practical
- clear health checks
- shared runtime paths only when explicitly configured

Do not assume:

- repo-local runtime paths are production-safe
- SQLite/local-only defaults are acceptable in deployment flows
- compose overrides should win over explicit environment intent unless documented

When touching deployment:

- check `docker-compose.yml`
- check `backend/.env.example`
- check health/readiness endpoints
- check audit scripts under `backend/scripts/`

## 11. Validation Checklist

At minimum, after a meaningful backend change run:

```bash
cd backend
black .
isort .
flake8 .
pytest
python3 scripts/architecture_guard.py
```

At repository level, common gates include:

```bash
npm test --prefix frontend
```

Also validate OpenAPI when contract surface changes:

```bash
npm run bundle:openapi
npm run validate:openapi
npm run bundle:openapi:target
npm run validate:openapi:target
```

For workflow-sensitive changes, smoke the real chain:

1. upload file
2. wait for parse/index ready
3. send chat with and without RAG hit
4. create session
5. draft outline
6. confirm outline
7. generate PPT and verify artifact download

## 12. Current Priority Order

Unless explicitly told otherwise, prioritize in this order:

1. Main workflow stability
   - upload
   - chat
   - outline draft
   - PPT/Word generation
2. Contract consistency
   - session state
   - event payload
   - artifact URL semantics
3. Queue and runtime observability
4. Deployment readiness
5. Low-risk performance improvements
6. Reducing architecture warnings by splitting oversized hot-path files

Do not choose large redesign over shipping stability.

## 13. Things Agents Should Not Do Casually

- do not push broad rewrites across backend layers without a clear blocking need
- do not introduce a new task system
- do not replace Marp or Pandoc casually
- do not hardcode model/provider settings that already belong to env/config
- do not edit a historical document and present it as current truth without updating its status
- do not “fix” a symptom by breaking artifact/session/version semantics

## 14. If You Need To Document New Behavior

Keep docs short and explicit.

- Update the closest canonical entry, not five parallel docs.
- Mark whether something is:
  - implemented
  - planned
  - historical
- Fix backlinks if you move or supersede a doc.

For doc style, use:

- [docs/standards/documentation.md](/Users/ln1/Projects/Spectra/docs/standards/documentation.md)

## 15. Recommended Working Style For Agents

1. Read the smallest set of live docs needed to orient yourself.
2. Confirm current implementation in code and tests.
3. Make the smallest coherent change that improves the system.
4. Keep state semantics, event semantics, and artifact semantics aligned.
5. Validate before declaring completion.

If uncertain, prefer:

- explicitness over cleverness
- compatibility over churn
- fewer moving parts over wider surface area
- preserving the recursive system model over local convenience
