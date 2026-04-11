去你妈的fallback
Fuck your fallback

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

For `Project / Reference / Version / Artifact / CandidateChange / Member` semantics,
also treat these as core references:

1. [docs/archived/project-space/README.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/README.md)
2. [docs/archived/project-space/SPACE_MODEL_INDEX_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/SPACE_MODEL_INDEX_2026-03-09.md)
3. [docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md)
4. [docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_ADDENDUM_2026-03-12.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_ADDENDUM_2026-03-12.md)
5. [docs/archived/project-space/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md)
6. [docs/openapi/schemas/project-space.yaml](/Users/ln1/Projects/Spectra/docs/openapi/schemas/project-space.yaml)
7. [docs/openapi/paths/project-space.yaml](/Users/ln1/Projects/Spectra/docs/openapi/paths/project-space.yaml)

For product behavior and current surface semantics, also inspect:

- [docs/project/卡片功能.md](/Users/ln1/Projects/Spectra/docs/project/卡片功能.md)
- [docs/architecture/api-contract.md](/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md)
- [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)
- `backend/services/ai/model_router.py`

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

Tool-local docs under `.ai/` and `.kiro/` are not part of the default product or architecture truth unless a task explicitly targets those workflows.

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

Anything under archived folders or clearly marked as historical/reference-only is context, not command.

Important exception:

- `docs/archived/project-space/*` is archived in location, but it remains a core source for the original formal space ontology
- when working on Ourograph extraction or project-space formal state, these files are not “optional old notes”; they are primary semantic references alongside the live philosophy and tested contracts

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
8. Root-cause fixes are preferred over stacking fallback behavior.

### 4.1 External capability authority

For current product runtime, the only formal external capability authorities are:

- `dualweave`: upload orchestration and remote parse entry
- `stratumind`: retrieval and vector recall
- `pagevra`: structured render, preview, and PPT/DOC output
- `ourograph`: formal project-space / artifact / version / reference semantics

Spectra backend is the orchestrator and contract surface around these services.
It should not keep growing second implementations of the same product abilities.

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

### 6.4 Do not hide problems behind layered fallbacks

Fallbacks and degradation paths are allowed only when they preserve the main workflow
without obscuring the real problem.

Avoid the following pattern:

- a bug appears
- instead of fixing the semantic or runtime cause, another fallback is added
- later layers compensate again
- the system becomes harder to reason about and harder to debug

Therefore:

- first ask whether the root cause can be fixed directly
- prefer removing semantic drift over patching around it
- do not choose the easiest local escape hatch if it increases future diagnosis cost
- every new fallback should have a clear scope, trigger condition, and reason to exist
- if a fallback is added for safety, it should not silently redefine the canonical behavior

When a fallback becomes the main reason the system “works”, the real task is usually to
repair the primary path, not add yet another compensating layer.

### 6.5 Courseware and render pipelines must not silently substitute low-quality fallback content

For courseware generation, preview generation, and PPT/DOCX rendering:

- do not add or keep fallback paths that silently replace the canonical output with obviously degraded placeholder content
- do not inject raw retrieval snippets, filenames, OCR residue, or generic English filler into user-visible courseware just to keep the pipeline “green”
- if AI generation fails, prefer explicit failure or tightly bounded outline-based recovery over source-dump style pseudo-courseware
- if rendering fails, surface a structured render failure rather than swapping semantics to a different preview/export path
- any temporary recovery path must be visibly marked, narrowly scoped, and must not redefine the normal product behavior

In practical terms:

- `render-service` is the canonical render path
- low-quality content fallback is not an acceptable substitute for successful courseware generation
- “the system still returned something” is not success if the returned artifact violates teaching quality or semantic clarity

### 6.6 Do not default to Python full-suite test runs

Python full-suite test runs in Spectra are expensive, slow, and may pull in external API
or environment-sensitive paths that are unrelated to the current change.

Default rule:

- do **not** run the entire Python test suite by default
- prefer the smallest meaningful validation set that covers the changed area
- prefer `py_compile`, architecture guards, and focused `pytest` targets over broad regression runs
- expand to broader suites only when the user explicitly asks for it or the change genuinely crosses those boundaries

Recommended validation order for normal backend work:

1. `python3 -m py_compile ...` for changed Python files
2. `python3 backend/scripts/architecture_guard.py`
3. focused `pytest` for directly affected modules/contracts
4. service-specific validation such as `./gradlew test` for `ourograph`

“Safer because it ran more tests” is not a good default if the extra tests are mostly
unrelated, slow down iteration, or depend on external systems.

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

## 15. Agent Self-Maintenance Rules

`AGENTS.md` is not self-modifying software, but agents working in this repository are expected to
maintain repository knowledge proactively when a pattern becomes stable.

### 15.1 When an agent should update docs without being asked

An agent should proactively update documentation when all of the following are true:

1. the issue is not a one-off accident
2. the root cause is understood
3. the conclusion is likely reusable
4. there is a clear authoritative place to record it
5. recording it reduces future confusion or repeated mistakes

### 15.2 Typical triggers for proactive updates

- a state, error, or artifact contract changed in a stable way
- a queue/fallback/runtime rule was clarified by real incidents
- a provider/model/config trap was diagnosed and confirmed
- a validation or deploy step became mandatory for safe changes
- a file/module boundary rule had to be enforced repeatedly

### 15.3 Where new knowledge should go

- update `AGENTS.md` for repository-wide agent behavior, interpretation rules, and hard editing constraints
- update `docs/standards/*.md` for stable engineering standards
- update product or architecture docs when the product or system model changed
- update [docs/agent-memory.md](/Users/ln1/Projects/Spectra/docs/agent-memory.md) for half-stable operational knowledge and confirmed recurring pitfalls

### 15.4 What should not be "learned" into docs

Do not update standards or agent guides for:

- temporary outages
- unverified suspicions
- one-time debugging notes
- local machine accidents
- workaround code that is not yet accepted as repository policy

Prefer promoting knowledge in this order:

1. incident or local finding
2. repeated or verified pattern
3. `docs/agent-memory.md`
4. standards or `AGENTS.md` if it is now repository policy

## 16. Best-Practice Alignment

This repository should follow existing engineering best practices, but not by cargo-cult copying generic templates.

Use best practices only when they improve Spectra's actual system:

- single source of truth
- contract-first semantics
- explicit module boundaries
- environment-driven configuration
- observable pipelines
- small coherent commits
- tests and docs aligned with behavior
- fixing causes instead of accumulating compensating behavior

When a common best practice conflicts with the current system shape:

- prefer the practice that preserves Spectra's ontology and workflow loop
- avoid importing fashionable abstractions that add layers without reducing confusion
- prefer repository-specific guidance over generic industry boilerplate

In practice, the best reference set for agent work is:

1. current passing code and tests
2. canonical philosophy and standards docs
3. current runtime/deploy behavior
4. community best practice adapted to the above

## 17. Recommended Working Style For Agents

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
