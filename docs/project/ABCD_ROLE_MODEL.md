# ABCD Role Model

> Updated: 2026-03-21
> Status: active

## 1. Purpose

This document defines the current working model for the four core developers in Spectra.

It is not a rigid ownership contract.
It is a default collaboration map intended to:

- reduce collision and rework
- preserve main-workflow stability
- give the technical backend role a clear long-term direction
- keep final semantic control with A

Default principle:

- low conflict is more important than high parallelism
- default ownership is more important than strict isolation
- C and D may negotiate directly, but they should negotiate on top of this map instead of redefining responsibilities from zero each time

## 2. Team Roles

### 2.1 A: Product-Technical Lead

A is the overall control point.

A owns:

- business narrative and phase goals
- core semantics and contract language
- priority of major modules
- final arbitration for C/D task split
- cross-frontend/backend integration
- decisions on whether a technical deep-dive result should enter the mainline

A should not be the default implementer for:

- C's main business backend work
- D's technical experiments
- repeated cleanup caused by unclear role boundaries

### 2.2 B: Frontend Lead

B owns:

- workbench and studio frontend delivery
- card experience and interaction implementation
- visible product value under already-defined contracts

B should not be responsible for:

- inferring backend semantics
- designing backend contracts on behalf of A/C
- absorbing unresolved C/D disagreements

### 2.3 C: Mainline Backend

C is the primary backend owner for traditional business logic and stable delivery.

C focuses on:

- router/service/data layering
- generation session mainline
- command/query/event contract landing
- preview/export/artifact download business closure
- project-space artifact/reference/candidate-change business semantics
- queue/worker/task-runtime business integration
- state semantics, error semantics, terminal-state sync
- stable APIs needed by B

C's default traits:

- stable
- deliverable
- contract-consistent
- state-conscious
- low-drama

### 2.4 D: Technical Deep-Dive Backend

D is the specialized backend owner for technical deep dives, not the second mainline backend.

D focuses on:

- AI/RAG/routing/prompt/eval/multimodal quality
- problem discovery and experiment design
- evaluation baselines and quality gates
- strategy design and integration proposals
- selective mainline participation only when a deep-dive topic is being adopted

D's default traits:

- depth
- highlights
- defensibility
- metrics
- quality gates
- future capability reserves

## 3. Default Ownership Map

This is a default map, not a hard prohibition.

### 3.1 A default area

- semantic vocabulary
- contract changes
- state vocabulary
- artifact / preview / download semantic decisions
- major integration and final merge judgment

### 3.2 B default area

- frontend pages
- interaction flow
- presentation quality
- frontend state and API consumption

### 3.3 C default area

- `backend/routers/generate_sessions/*`
- `backend/services/generation_session_service/*`
- `backend/services/task_executor/*`
- `backend/services/task_queue/*`
- `backend/services/project_space_service/*`
- `backend/routers/project_space/*`
- `backend/services/artifact_generator/*`
- `backend/services/generation/*`

### 3.4 D default area

- `backend/services/ai/*`
- `backend/services/rag_service/*`
- `backend/services/media/embedding.py`
- `backend/services/media/rag_indexing.py`
- `backend/services/network_resource_strategy/*`
- `backend/services/prompt_service/*`
- `backend/eval/*`

## 4. Working Rules

### 4.1 Default split

- mainline backend needs default to C
- technical deep-dive topics default to D
- frontend delivery defaults to B
- contract/semantic judgment defaults to A

### 4.2 Weak-boundary negotiation

The team does not require hard isolation between C and D.

However, the expected behavior is:

- C and D negotiate directly before cross-area changes
- they start from the default map above
- A only intervenes when the change affects semantics, contracts, or unresolved disagreement

### 4.3 Prefer serial handoff over forced parallelism

The team should not optimize for maximum parallelism by default.

Recommended pattern:

1. D explores a deep-dive topic and produces:
   - problem definition
   - samples
   - baseline
   - strategy
   - integration recommendation
2. C or D then integrates the result into the mainline after discussion

When a task mixes business-mainline work and technical exploration, split it into stages instead of having C and D edit the same layer at the same time.

## 5. C Working Contract

### 5.1 C should optimize for

- main-workflow closure
- semantic consistency
- stable interfaces
- explicit state handling
- structured service orchestration
- testability

### 5.2 C should avoid

- technical exploration with unclear payoff
- long-running evaluation or research work
- changing mainline semantics while exploring
- putting orchestration back into routers

### 5.3 C task template

Each C task should state:

- goal
- affected main workflow
- semantics that must not change
- modules touched
- whether any contract changes are required
- acceptance criteria

## 6. D Working Contract

### 6.1 D should optimize for

- uncertain but high-value technical questions
- measurable quality gains
- durable evaluation assets
- business-facing technical highlights
- integration proposals that C can actually adopt

### 6.2 D should avoid

- fragmented business chores
- ad hoc interface patching
- mixing business delivery and technical exploration in the same task
- claiming improvement without baseline or evaluation

### 6.3 D task template

Each D topic should state:

- technical problem
- why it matters to Spectra
- current code touchpoints
- sample and evaluation plan
- improvement metrics
- proposed implementation area
- integration handoff path for C
- rollback condition if results are weak

## 7. Escalation Rules

A should be consulted when a change affects:

- API fields
- state/stateReason/error semantics
- artifact / preview / download semantics
- cross-team delivery priority
- unresolved C/D disagreement

## 8. Success Signals

This role model is working when:

- C is no longer frequently pulled into D's topics
- D is no longer frequently pulled into routine business work
- C/D conversations start from the default map instead of from scratch
- A spends more time on direction and semantic decisions than on rewrite cleanup
- D produces topic-based outputs instead of scattered experimentation
- C keeps mainline workflows stable without being interrupted by deep-dive work
