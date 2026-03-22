# D Tech Deep Dive Map

> Updated: 2026-03-22
> Status: historical / reference-only

> This file was moved out of the active `docs/project` surface during doc cleanup.
> It is preserved for historical context only.

## 1. Purpose

This document defines the long-term technical deep-dive space owned by D.

It exists to keep D out of routine mainline backend work and to give technical exploration a stable, reusable structure.

D is not expected to own business-mainline semantics such as:

- generation session contract
- artifact business semantics
- preview/export/download business behavior
- routine CRUD and interface delivery

D is expected to own deep-dive topics that strengthen Spectra's technical depth without hijacking the mainline.

For concrete next tasks, see [D_EXECUTION_BACKLOG.md](./D_EXECUTION_BACKLOG.md).

## 2. Output Model For Every D Topic

Every deep-dive topic should produce:

- problem definition
- current-state evidence
- sample set
- baseline
- proposed strategy
- measurable metrics
- integration point
- recommendation: adopt / continue research / stop

Recommended topic cadence:

- D should hold only 1-2 active topics at the same time
- each topic should run for at least 2 weeks
- no topic is considered mature without evaluation artifacts

## 3. Topic Map

### 3.1 Model Routing and Provider Governance

Current code anchors:

- `backend/services/ai/model_router.py`
- `backend/services/ai/service.py`
- `backend/eval/router_quality_audit.py`
- `backend/eval/provider_harness.py`
- `backend/eval/provider_harness_baseline.py`

Current practical reality:

- route selection already exists
- fallback metadata already exists
- quality/cost/latency audit already has a baseline structure

Suggested deep-dive directions:

- upgrade task-based routing toward feature-based routing
- improve small-model / large-model switching policy
- standardize timeout / completion error / fallback taxonomy
- maintain provider comparison baselines
- optimize the quality-cost-latency triangle
- maintain the non-degradable task list

Recommended metrics:

- `quality_delta`
- `latency_reduction_rate`
- `cost_reduction_rate`
- `fallback_rate`
- `non_degradable_misroute_rate`

Recommended adoption rule:

- no routing policy change enters the mainline without an updated baseline and audit result

### 3.2 RAG Retrieval Quality

Current code anchors:

- `backend/services/rag_service/retrieval.py`
- `backend/services/rag_service/retrieval_helpers.py`
- `backend/routers/chat/message_flow.py`
- `backend/eval/run_eval.py`
- `backend/eval/baseline_manager.py`

Current practical reality:

- search already combines local session, local project, and referenced projects
- reranking exists but remains lightweight

Suggested deep-dive directions:

- better ranking across `local_session / local_project / reference_base / reference_auxiliary`
- rerank upgrades beyond current lightweight logic
- query-type-aware retrieval for teaching scenarios
- improve reference-project knowledge fusion quality
- improve no-hit explanation quality
- chunk merge, de-duplication, and relevance refinement

Recommended metrics:

- `hit_rate@k`
- `mrr@k`
- `keyword_hit_rate`
- `failure_rate`
- `avg_latency_ms`
- `explainability_rate`
- `continuity_rate`

Recommended adoption rule:

- retrieval changes should first prove quality on evaluation datasets before being used by chat or generation by default

### 3.3 Citation Quality and Source Explainability

Current code anchors:

- chat citation runtime helpers under `backend/routers/chat/*`
- `backend/eval/citation_quality_audit.py`
- `backend/eval/source_quality_audit.py`
- `backend/eval/dialogue_memory_audit.py`

Suggested deep-dive directions:

- improve citation coverage without increasing false attribution
- align citation placement with actual sentence usage
- improve multi-source citation mapping
- unify source explainability expectations across chat, preview, and generation
- improve timestamp citation quality for audio/video sources

Recommended metrics:

- `citation_coverage_rate`
- `misquote_rate`
- `relevance_rate`
- `readability_rate`
- `contract_consistency_rate`

Recommended adoption rule:

- prefer explainable source use over purely higher citation counts

### 3.4 Dialogue Memory and Session Intelligence

Current code anchors:

- `backend/routers/chat/runtime.py`
- `backend/routers/chat/message_flow.py`
- `backend/services/prompt_service/chat.py`
- `backend/eval/dialogue_memory_audit.py`

Suggested deep-dive directions:

- stronger session-scoped memory
- stable reference use across multi-turn conversations
- better teacher-intent understanding
- more natural follow-up strategy
- lower mechanical-response rate
- card-context-aware dialogue control

Recommended metrics:

- `hit_rate`
- `misquote_rate`
- `no_hit_notice_rate`
- `contract_consistency_rate`
- `session_isolation_rate`

Recommended adoption rule:

- prompt or memory changes should be versioned and evaluated, not merged by intuition alone

### 3.5 Upload-to-Index Quality Governance

Current code anchors:

- `backend/services/media/rag_indexing.py`
- `backend/services/media/embedding.py`
- `backend/services/media/audio.py`
- `backend/services/media/video.py`

Current practical reality:

- parse/chunk/normalize/embedding/index timings already exist
- fallback visibility already exists in parts of the pipeline

Suggested deep-dive directions:

- make parse fallback more explicit and quality-aware
- maintain correct text vs multimodal embedding routing
- optimize stage timings without hiding degradation
- assess multimodal material quality before indexing
- make remote embedding/provider failure transparent
- prevent silent degradation into opaque slowness

Recommended metrics:

- parse success rate
- fallback visibility rate
- `parse_ms`
- `chunk_ms`
- `normalize_ms`
- `embedding_ms`
- `index_ms`
- indexing failure rate

Recommended adoption rule:

- ingest changes must preserve observability and must not silently trade correctness for speed

### 3.6 Network Resource and Multimodal Knowledge-Unit Quality

Current code anchors:

- `backend/services/network_resource_strategy/*`
- `backend/eval/network_resource_quality_audit.py`

Suggested deep-dive directions:

- standardize web/audio/video knowledge units
- improve relevance ranking for teaching use cases
- strengthen low-quality resource rejection
- improve citation readiness of normalized units
- define quality thresholds for externally sourced teaching material

Recommended metrics:

- `normalization_rate`
- `relevance_pass_rate`
- `low_quality_reject_rate`
- `citation_ready_rate`

Recommended adoption rule:

- resource strategy changes should explain both acceptance and rejection behavior

### 3.7 Outline and Generation Quality Intelligence

Current code anchors:

- `backend/services/courseware_ai/*`
- `backend/eval/outline_flow_audit.py`

Suggested deep-dive directions:

- improve outline draft quality
- improve rewrite improvement rate
- improve confirm-ready quality
- strengthen adherence from outline to generated content
- improve fallback structural fidelity
- align teaching intent with generated outline structure

Recommended metrics:

- `draft_structure_pass_rate`
- `rewrite_improvement_rate`
- `confirm_ready_rate`
- fallback structure fidelity

Recommended adoption rule:

- D may improve generation quality intelligence, but session and artifact semantics remain with the mainline owner

### 3.8 Eval, Baseline, and Quality Gate System

Current code anchors:

- `backend/eval/*`

Current practical reality:

- the repository already contains a broad evaluation surface rather than one-off scripts

Suggested deep-dive directions:

- turn evaluation into routine team workflow
- maintain baselines per topic family
- define topic-specific gate expectations
- normalize how technical optimization proposals are reviewed
- make "no baseline, no maturity" a stable engineering habit

Recommended metrics:

- baseline freshness
- gate pass rate
- regression count by topic family
- adoption rate of evaluation-backed changes

Recommended adoption rule:

- no deep-dive topic should be considered complete without an explicit evaluation result

## 4. Handoff To Mainline

When D wants a topic to enter the mainline, the handoff package should include:

- what problem is solved
- what evidence supports adoption
- what code area should change
- what should remain untouched
- what fallback or rollback path exists
- whether D or C should perform the final integration

Recommended default:

- D researches and packages the result
- C and D discuss final integration ownership
- A decides only if semantics, contracts, or priorities are affected

## 5. Non-Goals For D

The following are explicitly not D's routine lane:

- owning generation-session business semantics
- owning artifact business contracts
- routine preview/export/download behavior work
- generic CRUD or interface delivery
- unplanned rescue work for scattered business tasks

## 6. Success Signals

This map is working when:

- D holds topic-based work instead of fragmented chores
- each topic has samples, baselines, and a recommendation
- mainline adoption discussions become clearer and shorter
- Spectra gains technical depth without destabilizing session/artifact semantics
- the team can point to concrete technical assets instead of informal ideas
