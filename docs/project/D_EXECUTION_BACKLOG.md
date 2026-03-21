# D Execution Backlog

> Updated: 2026-03-21
> Status: active

## 1. Purpose

This document turns D's deep-dive role into concrete, code-anchored work.

It is intentionally specific:

- what to work on
- where in the codebase to start
- why it matters now
- what to deliver
- when to stop

This is not a generic research list.
It is the current recommended backlog for the specialized backend role in Spectra.

## 2. Current Repository Signals

These observations come from the current code and docs surface:

- `architecture_guard` is clean, so D does not need to spend cycles on generic file-splitting cleanup.
- `backend/eval/*` is already broad and useful, but many topic lines still look like standalone tooling rather than a routine decision system.
- `backend/routers/chat/refine_context.py` still uses a very lightweight chapter-token rerank heuristic.
- `backend/services/courseware_ai/outline.py` and `backend/services/courseware_ai/generation.py` already contain fallback and quality heuristics, but the quality loop is not yet a strong, explicit gate.
- `backend/services/quality_service/service.py` exists and is tested, but is not clearly part of the normal generation mainline yet.
- `backend/services/media/rag_indexing.py`, `backend/services/media/embedding.py`, and `backend/services/file_parser/*` already expose fallback and timing data, but the degradation story is still fragmented across modules.
- `backend/eval/provider_harness.py` is still mock-oriented and is useful as a framework, but not yet a strong real-provider decision tool.

Based on those signals, D should not start with "invent a new capability."
D should start by turning existing partial assets into decision-grade technical systems.

## 3. How D Should Work

D should work on only 1-2 active topics at a time.

Each topic should include:

- problem statement
- sample set
- baseline run
- strategy proposal
- implementation or integration point
- final recommendation

Each topic should end in one of three conclusions:

- adopt into mainline
- continue as research
- stop and archive the result

## 4. Priority Order

### P0: Must start here

These are the highest-value starting topics for D.

1. Retrieval and rerank quality
2. Dialogue memory and citation consistency
3. Ingest degradation transparency
4. Evaluation workflow operationalization

### P1: Start after P0 is stable

1. Outline/generation quality gating
2. Provider governance beyond mock harness
3. Network-resource ranking quality

### P2: Start only after earlier topics produce stable outputs

1. Feature-based model routing
2. Multimodal teaching-resource quality scoring
3. Card-context-aware dialogue refinement

## 5. Concrete Tasks

### Task D-01: Replace lightweight chapter rerank with a configurable retrieval strategy

Why now:

- current chat rerank logic is concentrated in `backend/routers/chat/refine_context.py`
- it only boosts by chapter-token matching
- Spectra already supports local session, local project, and referenced project retrieval, so ranking is now too simple for the system shape

Start here:

- `backend/routers/chat/refine_context.py`
- `backend/routers/chat/message_flow.py`
- `backend/services/rag_service/retrieval.py`
- `backend/eval/run_eval.py`
- `backend/eval/dataset.json`

Task:

- extract the current rerank logic into a strategy-oriented helper
- add ranking features for source scope:
  - `local_session`
  - `local_project`
  - `reference_base`
  - `reference_auxiliary`
- preserve chapter-token boost, but stop treating it as the only rerank signal
- add evaluation cases where the expected result differs by session scope or reference scope

Deliverables:

- a new retrieval/rerank helper or strategy module
- updated evaluation dataset with scope-sensitive samples
- one baseline result and one post-change result
- a short note explaining which ranking signals improved quality and which did not

Definition of done:

- rerank logic is no longer trapped inside the chat router helper
- evaluation covers more than chapter token matching
- D can explain when a referenced project should outrank the local project and when it should not

Stop if:

- the strategy becomes too entangled with mainline contract code
- improvements are not visible in evaluation results

### Task D-02: Harden dialogue-memory contract consistency

Why now:

- `backend/eval/dialogue_memory_audit.py` already defines strong metrics
- chat responses already carry `rag_hit`, citations, and observability metadata
- this is a high-value area because it directly affects whether Spectra feels like a real teaching copilot

Start here:

- `backend/routers/chat/runtime.py`
- `backend/routers/chat/message_flow.py`
- `backend/services/prompt_service/chat.py`
- `backend/eval/dialogue_memory_audit.py`
- `backend/eval/dialogue_memory_samples.json`
- `backend/eval/dialogue_memory_samples_dps3.json`

Task:

- expand the dialogue-memory sample sets around:
  - session isolation
  - correct no-hit notice behavior
  - citation vs inline cite-tag consistency
  - rag-hit vs observability consistency
- identify where the current pipeline can produce semantically inconsistent output
- make a small, targeted fix only if the audit shows a repeatable issue

Deliverables:

- expanded dialogue-memory dataset
- latest audit output
- a mismatch taxonomy:
  - missing citation
  - wrong citation
  - rag_hit inconsistency
  - session leakage
  - weak no-hit messaging

Definition of done:

- D can point to a concrete contract-consistency report, not just a feeling
- the team has a stable sample set for future chat-related changes

Stop if:

- there is no measurable inconsistency in current behavior
- the work drifts into general chat rewriting instead of contract hardening

### Task D-03: Unify degradation visibility across parser, embedding, and indexing

Why now:

- degradation information exists, but is spread across `file_parser`, `embedding`, `rag_indexing`, `audio`, `video`, and `capability_health`
- Spectra explicitly cares about avoiding "opaque slowness"
- this topic is technical, useful, and low-risk to mainline semantics

Start here:

- `backend/services/file_parser/__init__.py`
- `backend/services/file_parser/fallback.py`
- `backend/services/media/embedding.py`
- `backend/services/media/rag_indexing.py`
- `backend/services/capability_health.py`
- `backend/schemas/common.py`

Task:

- map all current degradation and fallback outputs
- normalize the terminology used for:
  - provider unavailable
  - timeout
  - degraded to local
  - empty-output fallback
  - capability unavailable
- define one comparison table showing where the current wording diverges
- propose and implement a minimally invasive normalization path

Deliverables:

- a degradation vocabulary table
- one repo-backed note on current degradation categories
- normalized logging or payload terminology where safe
- before/after examples from parser/indexing flows

Definition of done:

- D can answer "what degraded, why, and to what" for the ingest pipeline without hopping across five incompatible vocabularies
- at least one real degradation path becomes easier to observe and compare

Stop if:

- the work starts altering public contract semantics without A approval

### Task D-04: Turn eval from scripts into a real recurring decision habit

Why now:

- `backend/eval/*` is already rich enough to be valuable
- today it still risks becoming "tooling on the side" instead of a real gate
- D is the right person to make technical quality visible and routine

Start here:

- `backend/eval/README.md`
- `backend/eval/run_eval.py`
- `backend/eval/router_quality_audit.py`
- `backend/eval/dialogue_memory_audit.py`
- `backend/eval/citation_quality_audit.py`
- `backend/eval/outline_flow_audit.py`

Task:

- define which 3-4 evals are "always relevant" for current development
- propose a light-weight run order:
  - retrieval
  - dialogue memory
  - citation
  - outline or router, depending on the change type
- document what kind of change should trigger which eval
- make the README more operational for the team

Deliverables:

- a rewritten eval running guide focused on team use
- a trigger matrix:
  - change type -> which evals must run
- one example of a "topic completion package" using real eval outputs

Definition of done:

- the team can tell which evals to run without reading every script
- D's work becomes easier to review because it arrives with the right evaluation surface

Stop if:

- the work becomes a CI redesign instead of a team-usable evaluation protocol

### Task D-05: Promote generation quality from heuristics to an explicit gate

Why now:

- outline generation already uses sparse-outline repair and deterministic fallback
- content generation already uses fallback courseware logic
- `backend/services/quality_service/service.py` already exists but is not yet a strong, explicit quality gate in the normal story

Start here:

- `backend/services/courseware_ai/outline.py`
- `backend/services/courseware_ai/generation.py`
- `backend/services/courseware_ai/generation_support.py`
- `backend/services/quality_service/service.py`
- `backend/eval/outline_flow_audit.py`

Task:

- assess where `check_quality()` should sit in the generation quality loop
- compare the current heuristic repairs against explicit quality scoring
- propose a non-invasive integration point:
  - quality report in logs
  - quality warning in internal payload
  - quality-aware fallback recommendation

Deliverables:

- a short integration design for quality-service usage
- sample before/after reports on generated content
- recommendation on whether quality-service should stay advisory or become a gate

Definition of done:

- the team can explain how generation quality is checked, not just how fallback happens

Stop if:

- the change would force public contract changes before the internal quality model is stable

### Task D-06: Upgrade provider harness from mock pre-research to real decision support

Why now:

- `backend/eval/provider_harness.py` is still a pre-research harness using `mock_high` and `mock_low`
- useful as scaffolding, but too weak for real provider decisions

Start here:

- `backend/eval/provider_harness.py`
- `backend/eval/provider_comparison.py`
- `backend/eval/provider_sample_pool.json`
- `backend/eval/provider_thresholds.json`
- `backend/services/parsers/*`

Task:

- keep the mock harness as a stable base
- design a second stage that can compare real parser providers when available
- enlarge the sample pool beyond tiny text snippets
- add sample categories that resemble actual uploaded teaching materials

Deliverables:

- a v2 sample pool design
- a proposal for how real-provider runs should be executed and compared
- an explicit separation between:
  - mock harness
  - real provider comparison

Definition of done:

- D can answer whether provider harness is still pre-research or mature enough for real provider selection

Stop if:

- no real providers are available and the work becomes speculative abstraction

### Task D-07: Improve network resource ranking for teaching usefulness

Why now:

- `backend/services/network_resource_strategy/ranking.py` is currently lexical
- `backend/eval/network_resource_quality_audit.py` already exists
- this is a strong medium-term deep-dive topic with clear evaluation support

Start here:

- `backend/services/network_resource_strategy/ranking.py`
- `backend/services/network_resource_strategy/text_utils.py`
- `backend/eval/network_resource_quality_audit.py`
- `backend/eval/network_resource_samples.json`

Task:

- study where lexical ranking fails for educational usefulness
- add teaching-aware ranking signals if the current dataset shows obvious misses
- strengthen the dataset before changing ranking logic

Deliverables:

- expanded network-resource samples
- ranked failure examples
- a revised ranking strategy or a documented conclusion that lexical ranking is still enough for now

Definition of done:

- D can show concrete cases where ranking changed for a good reason

Stop if:

- the dataset does not yet justify strategy changes

## 6. Recommended 6-Week Sequence For D

### Weeks 1-2

- D-01 Retrieval and rerank quality
- D-02 Dialogue-memory contract consistency

### Weeks 3-4

- D-03 Degradation visibility normalization
- D-04 Eval workflow operationalization

### Weeks 5-6

- D-05 Generation quality gate assessment
- D-06 Provider harness maturation

D-07 should start only if one of the first six topics is stable or blocked.

## 7. What D Should Explicitly Not Pick Up Next

These tasks may look urgent, but they should not be D's default lane:

- generation-session router/service business refactors
- project-space artifact semantics work
- preview/export/download contract work
- ordinary CRUD or auth interface tasks
- random support tickets that have no technical-depth value

## 8. Handoff Notes For A and C

When D finishes a topic, D should hand off:

- the problem statement
- the baseline result
- the changed strategy or recommendation
- what needs mainline integration
- what should stay untouched
- who should do the integration next

For most topics:

- D should own the research and recommendation
- C and D should decide together who performs the final integration
- A should decide only when semantics, contracts, or priorities are involved
