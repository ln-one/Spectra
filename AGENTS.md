去你妈的fallback
Fuck your fallback

# Spectra Agent Guide

> Status: `current`
> Role: repository entry contract for AI coding agents working in Spectra.
>
> This file defines what to trust, how to interpret stale docs, what the current
> runtime reality is, and how to modify the system safely. It is the entry
> contract, not the full architecture encyclopedia.

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

## 2. Canonical Entry Docs

Read these first before editing code:

1. [docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md](/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md)
2. [docs/project/README.md](/Users/ln1/Projects/Spectra/docs/project/README.md)
3. [docs/project/requirements.md](/Users/ln1/Projects/Spectra/docs/project/requirements.md)
4. [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)
5. [docs/architecture/system/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/system/overview.md)
6. [docs/architecture/system/kernel-note.md](/Users/ln1/Projects/Spectra/docs/architecture/system/kernel-note.md)
7. [docs/architecture/backend/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md)
8. [docs/architecture/api-contract.md](/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md)
9. [docs/standards/backend.md](/Users/ln1/Projects/Spectra/docs/standards/backend.md)
10. [docs/agent-memory.md](/Users/ln1/Projects/Spectra/docs/agent-memory.md)
11. [docs/documentation/source-of-truth.md](/Users/ln1/Projects/Spectra/docs/documentation/source-of-truth.md)

For `Project / Reference / Version / Artifact / CandidateChange / Member`
semantics, archived project-space docs remain important semantic references:

1. [docs/archived/project-space/README.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/README.md)
2. [docs/archived/project-space/SPACE_MODEL_INDEX_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/SPACE_MODEL_INDEX_2026-03-09.md)
3. [docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md)
4. [docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_ADDENDUM_2026-03-12.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_ADDENDUM_2026-03-12.md)
5. [docs/archived/project-space/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md)

For actual implementation truth, inspect live code and tests.

## 3. Trust Order and Stale-Doc Rules

Use this trust order:

1. Live code covered by passing tests
2. Canonical philosophy and standards docs
3. OpenAPI contracts and current runtime behavior
4. Active design refs in `docs/project`
5. Historical / archived / migration docs

When docs disagree:

- If a doc is clearly target-state and code lags, move code toward the doc.
- If a doc is historical or contradicted by current tested behavior, do not drag code backward.
- If unclear, choose the most conservative, explicit interpretation and leave the repo more legible than before.

Important exception:

- `docs/archived/project-space/*` is archived in location but still primary for formal ontology reference.

Tool-local docs under `.ai/` and `.kiro/` are not default architecture truth unless the task explicitly targets them.

## 4. Current Runtime Reality

### 4.1 Spectra backend is a workflow shell

Spectra backend is not the owner of all product capabilities.

It is better understood as:

- a `workflow shell`
- an `orchestration kernel`
- a `contract surface`

It is not:

- a traditional monolith that directly owns every product ability
- a hollow gateway with no legitimate local responsibilities

It owns:

- Session / run / event lifecycle
- task orchestration and queue dispatch
- response shaping and artifact download binding
- adapter / facade layers around external authorities

It should not keep growing second implementations of formal product abilities.

### 4.2 The six formal capability authorities

For current runtime, the only formal external capability authorities are:

- `diego`: AI courseware / PPT generation
- `pagevra`: structured render, preview, and PPT/DOC output
- `ourograph`: formal project-space / artifact / version / reference semantics
- `dualweave`: upload orchestration and remote parse entry
- `stratumind`: retrieval and vector recall
- `limora`: identity, login session, organization/member identity container

### 4.3 Anti-corruption layer rule

Spectra adapters and facades may:

- translate payloads
- normalize responses
- maintain a local mirror where needed

They may not:

- redefine upstream formal semantics
- become a second domain owner
- silently replace a formal authority with a local fallback path

### 4.4 Local organ classification

Not every local module is a failure of the six-service architecture.

Classify remaining backend-local capabilities in three buckets:

- `kernel organs`: legitimate Spectra-owned control-plane capabilities such as Session orchestration, event/state coordination, artifact binding, prompt/routing policy, and contract shaping around the six authorities
- `transitional local auxiliaries`: allowed local support modules such as `file_parser`, `media/embedding` glue, `rag_api_service` response shaping, and non-Office `artifact_generator` helpers; these may exist, but must not present themselves as formal product authorities
- `residual legacy organs`: compatibility leftovers, stale local truth, and giant helpers that still make backend look like it owns formal render / identity / generation / formal-state semantics; these should be isolated or removed over time

If a module does not clearly fit one of these buckets, treat it as a cleanup target rather than quietly letting it become a new shadow authority.

## 5. Current Primary Pipelines

### 5.1 Upload and RAG

`upload -> parse -> normalize -> chunk -> embedding -> index -> retrieval`

Important reality:

- text retrieval should use `text-embedding-v4`
- multimodal embedding should use `qwen3-vl-embedding`
- remote embedding failures must not silently degrade into opaque slowness

### 5.2 Chat

`project/session check -> user message persist -> history load + RAG load -> prompt build -> AI generate -> assistant persist`

Important reality:

- model choice must come from env/config, not hidden hardcoding
- `CHAT_RAG_TIMEOUT_SECONDS` exists to stop RAG from freezing chat
- observability must distinguish RAG delay from generation delay

### 5.3 Generation

`session bootstrap -> Diego outline -> confirm outline -> Diego generation -> artifact persist -> preview/download`

Important reality:

- `GenerationTask` is historical execution terminology only, not the product’s current primary model
- `CONFIRM_OUTLINE` for PPT must run with a Diego binding
- generation outputs must land as project-space artifacts
- preview/render/export remain on Pagevra contract surfaces

### 5.4 Queue and execution

`API/service dispatch -> RQ enqueue -> worker execute -> session event update -> terminal state sync`

Important reality:

- queue execution remains primary for indexing/parse/background work
- PPT session generation is Diego-orchestrated, not the legacy generationtask worker path
- `local_async` is fallback, not the normal design
- only fresh workers count as available workers

## 6. Editing Rules

### 6.1 Respect layers

Backend layering is:

`router -> application service -> domain/data`

- routers parse/auth/call/shape
- services orchestrate semantics and external calls
- storage stays behind service/data boundaries

### 6.2 Prefer folder-as-module

Follow [docs/standards/backend.md](/Users/ln1/Projects/Spectra/docs/standards/backend.md):

- `>300` lines: review for single responsibility
- `>500` lines: split by default
- `>800` lines: priority refactor

Do not keep adding logic to already-warned files unless the change is trivial.

### 6.3 No hidden compatibility forks

Avoid:

- duplicate state vocabularies
- duplicate output URL semantics
- duplicate model selection logic
- duplicate queue worker health logic
- duplicate artifact persistence semantics
- duplicate capability names for the same service

### 6.4 No layered fallback sludge

Root-cause fixes are preferred over compensating fallbacks.

Do not let “the system still returned something” redefine success if semantics degraded.

In practical terms:

- low-quality courseware fallback is not success
- fake PPT/DOC/video artifacts are not success
- structured explicit failure is better than junk output

### 6.5 Render and generation truth

Current practical chain:

- PPT generation: Diego
- preview/render/export: Pagevra
- formal state and artifact semantics: Ourograph

Do not reintroduce backend-local Marp/Pandoc/office generation as a formal path.

### 6.6 Validation default

Do **not** run full Python suite by default.

Normal backend validation order:

1. `python3 -m py_compile <changed_python_files>`
2. `python3 backend/scripts/architecture_guard.py`
3. focused `pytest`
4. service-specific validation if needed

## 7. Runtime and Deploy Rules

### 7.1 Config authority

Check `backend/.env` early before inventing new env names or duplicate config paths.

### 7.2 Canonical local startup

Use `scripts/compose_smart.py` as the only startup entry.

Recommended flow:

```bash
python3 ./scripts/compose_smart.py status
python3 ./scripts/compose_smart.py sync --channel develop
python3 ./scripts/compose_smart.py doctor
python3 ./scripts/compose_smart.py up --build
```

Local source checkouts for private services are the default dev mode when present.
Locked remote images are fallback-only for environments without local source trees.

## 8. Documentation Rules

- Update the closest canonical entry, not five parallel docs.
- Mark whether something is `current`, `active design`, `compatibility`, `historical`, or `retired`.
- Do not edit a historical doc and present it as current truth without an explicit status note.
- Use [docs/standards/documentation.md](/Users/ln1/Projects/Spectra/docs/standards/documentation.md).

## 9. Agent Self-Maintenance

Promote knowledge only when:

1. it is not a one-off
2. root cause is understood
3. the conclusion is reusable
4. there is a clear authoritative place to record it
5. recording it reduces future confusion

Promotion order:

1. local/incident finding
2. repeated verified pattern
3. `docs/agent-memory.md`
4. standards / `AGENTS.md` if now repository policy

## 10. Pointers

- [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)
- [docs/architecture/system/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/system/overview.md)
- [docs/architecture/backend/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md)
- [docs/architecture/api-contract.md](/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md)
- [docs/agent-memory.md](/Users/ln1/Projects/Spectra/docs/agent-memory.md)
- [backend/README.md](/Users/ln1/Projects/Spectra/backend/README.md)
- [docs/documentation/source-of-truth.md](/Users/ln1/Projects/Spectra/docs/documentation/source-of-truth.md)
