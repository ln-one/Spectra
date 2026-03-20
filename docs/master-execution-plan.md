# Spectra Master Execution Plan

This document is the single working plan for what Codex should continue to do automatically.
It exists to keep the direction stable, prevent drift, and preserve the project's deeper intent while we keep shipping.

## North Star

Spectra is not meant to become a linear AI tool.
It is meant to become a self-referential product system in which:

- the library is both input and output
- outputs can return as structured inputs
- creation naturally becomes accumulation
- accumulation naturally becomes reuse
- reuse naturally becomes further creation

In other words:

- unconscious sedimentation (`0 -> 1`)
- infinite expansion (`1 -> infinity`)

The practical mission is therefore not just to add features, but to make the system:

- product-grade
- demonstrable
- technically distinctive
- robust enough for competition and real deployment
- faithful to the project's philosophy

## Working Principles

Codex should default to these principles unless explicitly redirected:

1. Do not interrupt frequently.
2. Prefer low-risk, high-yield progress.
3. Do not perform large-scale architecture rewrites unless truly necessary.
4. Use `docs/project/` and active docs as the source of design truth.
5. If direction is unclear, consult:
   - `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
   - `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
   - `/Users/ln1/Projects/Spectra/docs/postgres-migration-checklist.md`
   - `/Users/ln1/Projects/Spectra/docs/studio-card-backend-protocol.md`
6. Prefer changes that improve coherence, robustness, deployment readiness, and demonstrability.
7. Fix CI/review blockers early.
8. Keep docs minimal and clean; avoid producing noisy intermediate documents.

## Priority Overview

The work is organized into nine main tracks.

1. Studio cards completion and frontend integration support
2. Product presentation and showcase quality
3. Technical breakthrough preparation
4. Robustness and operational maturity
5. PostgreSQL readiness and migration
6. Docker-based distributed/cloud deployment readiness
7. Competition presentation assets
8. Observability and evaluation baselines
9. Demo environment and golden-path assets

---

## Track A — Studio Cards Completion And Integration Readiness

### Goal
Move Studio cards from "backend-supported" to "fully integration-ready and presentation-ready".

### Why it matters
This is the most visible embodiment of the product philosophy:

- materials enter the library
- the library generates structured outputs
- outputs return into the system through refine and reuse

### Codex should continue to do
- keep `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/studio_cards.py` clean and thin
- keep `execution-plan / execution-preview / execute / sources / refine` aligned
- close remaining protocol inconsistencies across schemas, OpenAPI, and runtime behavior
- make the backend as frontend-friendly as possible without destabilizing the product model
- patch low-risk SDK/frontend integration issues where helpful

### Desired end state
- frontend can wire the full card flow without guessing
- foundation-ready cards feel stable and coherent
- refine behavior is clear and reusable
- cards feel like first-class execution units, not UI wrappers

---

## Track B — Product Presentation And Showcase Quality

### Goal
Strengthen the visible product loop so judges and users immediately understand the system's uniqueness.

### Core showcase loop
1. multimodal material enters the library
2. the library produces cards/artifacts/sessions
3. the user refines or redirects an output
4. the output returns to the library as the next structured input

### Codex should continue to do
- strengthen API and behavior around this loop
- reduce friction in the path from source -> card -> refine -> artifact -> reuse
- make system behavior easier to explain through cleaner naming and payload structure
- preserve the ontology of `Project / Session / Reference / Artifact / Version`

### Desired end state
- the system demo tells a coherent story in minutes
- the philosophy is visible in product behavior, not just docs

---

## Track C — Technical Breakthrough Preparation

### Goal
Prepare a set of meaningful, competition-grade optimization/problem statements that can be assigned to the more research-oriented backend member.

### Constraint
These tasks must be:

- tightly related to the system's ontology
- measurable
- demonstrable
- explainable in a defense setting

### Candidate optimization topics
1. local refine controllability
   - anchor-based / segment-based precise modification
   - preserve non-target regions while updating the intended portion
2. source-grounded generation
   - improve faithfulness to library material
   - reduce unsupported output
3. retrieval and reranking optimization
   - card-aware / session-aware retrieval quality improvements
4. task scheduling and queue optimization
   - better latency / timeout / retry behavior
5. result reuse and caching
   - reduce recomputation across outline/session/artifact/refine flows

### Codex should continue to do
- write a concrete optimization-task packet for handoff
- for each task, define:
  - problem statement
  - baseline
  - target metric
  - expected deliverable
  - competition value

### Desired end state
- the optimization-oriented backend member gets bounded, meaningful, high-value work
- the project gains real technical breakthroughs instead of generic "optimization"

---

## Track D — Robustness And Operational Maturity

### Goal
Make the system harder to break during demos, integration, and future deployment.

### Codex should continue to do
- keep improving worker / queue / timeout / retry / recovery behavior
- reduce internal error leakage to clients
- continue closing obvious consistency gaps in session, task, and artifact flows
- expand low-risk operational tooling when it directly improves reliability
- address CI/review blockers quickly

### Focus areas
- stuck tasks
- retry exhaustion behavior
- failure reason consistency
- recoverability
- queue health visibility
- safe error surfaces

### Desired end state
- fewer demo-breaking failure modes
- clearer failure semantics
- better operator confidence

---

## Track E — PostgreSQL Readiness And Migration

### Goal
Prepare the system for PostgreSQL and, once readiness is sufficient, proceed with actual migration.

### Important principle
This track does not stop at readiness forever.
Readiness is followed by migration.

### Codex should continue to do
#### E1. Readiness
- keep extending `/Users/ln1/Projects/Spectra/backend/scripts/postgres_readiness_audit.py`
- keep updating against `/Users/ln1/Projects/Spectra/docs/postgres-migration-checklist.md`
- identify and eliminate SQLite-specific assumptions

#### E2. Risk cleanup
Focus especially on:
- JSON-like fields
- idempotency flows
- `project_space_review`
- `generation_session`
- task / queue / event persistence
- ordering / transaction / uniqueness assumptions

#### E3. Migration path
- prepare provider/schema switch strategy
- prepare local PostgreSQL validation environment
- keep a Docker-based PostgreSQL shadow stack ready for validation and smoke checks
- prepare migration scripts
- prepare validation scripts
- prepare rollback/runbook logic
- keep a single cutover audit command that aggregates preflight, env contract, docker, and shadow-stack checks

#### E4. Execute migration when ready
Once conditions are met, proceed to:
- PostgreSQL schema landing
- data migration
- regression validation
- deployment switching prep

### Desired end state
- the project no longer sits on a temporary storage foundation
- PostgreSQL becomes the real platform base

---

## Track F — Docker-Based Distributed / Cloud Deployment Readiness

### Goal
Prepare the system for containerized, multi-service, multi-machine, cloud-capable deployment.

### Codex should continue to do
- clarify service topology across:
  - frontend
  - backend API
  - worker
  - Redis
  - vector/retrieval service
  - PostgreSQL
  - artifact/file storage
- continue improving deployment tooling:
  - preflight
  - role-aware env contract audits
  - smoke checks
  - worker diagnostics
  - release records
  - incident records
- identify and remove single-machine assumptions:
  - local path coupling
  - process-local state assumptions
  - API/worker same-host assumptions
  - storage assumptions
- improve docs and scripts for distributed deployment

### Desired end state
- the system is no longer only a local/dev machine artifact
- it is structurally ready for Dockerized cloud deployment

---

## Track G — Competition Presentation Assets

### Goal
Turn the project into something that is not only strong, but convincingly presentable as a top-tier work.

### Codex should continue to do
Help prepare the raw material for:
- system ontology diagram
- product value loop diagram
- technical breakthrough summary
- why this is not a generic AI teaching tool
- what makes the system commercially meaningful
- what makes the system philosophically distinct

### Desired end state
- the project can be defended clearly, not just shown

---

## Track H — Observability And Evaluation Baselines

### Goal
Make future optimization, migration, and deployment improvements measurable.

### Codex should continue to do
- continue standardizing metrics where useful
- improve visibility into:
  - latency
  - timeout
  - retry
  - success/failure rates
  - citation/source quality
  - retrieval quality
- support baseline collection for future algorithmic improvements

### Desired end state
- system improvements can be demonstrated quantitatively
- technical breakthroughs can be defended with evidence

---

## Track I — Demo Environment And Golden-Path Assets

### Goal
Make sure the project can be shown reliably under competition conditions.

### Codex should continue to do
- help stabilize a golden demo path
- identify where a demo dataset / demo project / sample sources are needed
- reduce friction in the end-to-end path that judges will actually see
- prepare for failure fallback where possible

### Desired end state
- demo success is repeatable, not luck-dependent

---

## Team Parallelization Guidance

This plan assumes the following practical collaboration split.

### User
Owns:
- product philosophy
- system ontology
- final product judgment
- architecture direction
- integration and competition narrative

### Frontend member
Owns:
- Studio card UX
- visible product experience
- execution/refine/sources interaction flow
- presentation polish

### Research/optimization backend member
Owns:
- bounded optimization topics from Track C
- measurable technical breakthroughs
- algorithmic/performance improvements with baselines

### Engineering-heavy backend member
Owns:
- bounded implementation work
- deployment/stability/tooling/testing tasks
- operational and systems tasks with clear interfaces

---

## What Codex Should Avoid

To stay aligned, Codex should avoid:

- large architecture churn without strong reason
- creating many temporary planning docs
- redefining ontology casually
- turning the system back into a linear generation tool
- spending disproportionate time on low-value micro-optimizations
- over-expanding features that do not strengthen the product loop or competition value

---

## Active Source Documents

When memory is fuzzy, consult these first:

- `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
- `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
- `/Users/ln1/Projects/Spectra/docs/postgres-migration-checklist.md`
- `/Users/ln1/Projects/Spectra/docs/studio-card-backend-protocol.md`
- `/Users/ln1/Projects/Spectra/docs/project/卡片功能.md`
- `/Users/ln1/Projects/Spectra/docs/project/requirements.md`

---

## Immediate Default Execution Order

Unless a new higher-priority blocker appears, Codex should generally proceed in this order:

1. clear CI/review blockers
2. finish card-related backend/frontend integration support
3. strengthen robustness in low-risk, high-yield areas
4. prepare optimization task packets
5. continue PostgreSQL readiness work
6. move from PostgreSQL readiness into migration when conditions permit
7. continue Docker/distributed deployment preparation
8. maintain only the minimum necessary documentation

---

## Final Intention

The project already has a strong soul.
This plan exists so implementation keeps serving that soul.

The purpose is not to merely finish a competition project.
The purpose is to build a work that is:

- coherent
- technically serious
- commercially narratable
- demonstrably differentiated
- philosophically alive
- structurally complete enough to keep growing
