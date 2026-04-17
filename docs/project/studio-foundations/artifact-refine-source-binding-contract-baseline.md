# Artifact / Refine / Source-Binding Contract Baseline

> Status: `active design`
> Updated: `2026-04-17`
> Purpose: define the target contract semantics that future `studio-cards` convergence should preserve across frontend and backend.

## 1. Scope

This document does not replace the current `studio-cards` API.

It defines the target semantic baseline for future convergence so that implementation work does not keep inventing card-specific payload conventions.

Current contract anchors:

- [frontend/lib/sdk/studio-cards.ts](../../../frontend/lib/sdk/studio-cards.ts)
- [backend/services/generation_session_service/card_execution_preview.py](../../../backend/services/generation_session_service/card_execution_preview.py)
- [docs/studio-card-backend-protocol.md](../../studio-card-backend-protocol.md)

## 2. Target internal type baseline

Future implementation should converge on the following internal semantic types:

- `ArtifactSurfaceType = document | teleprompter | graph | flashcard | simulator | sandbox | animation`
- `CapabilityEngine = rich_text | node_graph | single_item | simulation_loop | sandbox_html | media_timeline`
- `RefineMode = chat_refine | structured_refine | follow_up_turn`
- `SelectionScope = none | page | paragraph | node | question | scene`
- `ExecutionCarrier = session | artifact | hybrid`

These types are not yet a mandatory wire contract, but future code changes should move toward them instead of inventing new parallel vocabularies.

## 3. Artifact content rules

### 3.1 Artifact content must be machine-addressable when interaction depends on structure

Structured JSON is required when:

- selections must target stable nodes/paragraphs/questions/scenes
- refine may update only a part of the artifact
- the frontend surface is not just a passive viewer

Examples:

- `knowledge_mindmap`
  - graph/tree JSON should remain canonical, even if rendered with Markmap
- `interactive_quick_quiz`
  - questions should remain addressable by stable ids
- `demonstration_animations`
  - storyboard/scene structure should remain addressable even if the renderer later changes

### 3.2 Looser content formats are acceptable when structure is secondary

Allowed:

- `HTML`
  - for sandbox artifacts and previewable generated apps/games
- `Markdown`
  - for document-adjacent or summary-style artifacts when full editing is not yet required
- media files
  - for final render outputs like `gif`, `mp4`, `pptx`, `docx`

But even then, provenance and source metadata must remain structured.

## 4. Provenance baseline

Every runnable Studio artifact should eventually preserve enough metadata to answer:

- what card created this
- from which project/session/version context
- from which source artifacts
- under which execution request snapshot
- with which refine or turn ancestry

Minimum provenance fields:

- `card_id`
- `execution_carrier`
- `surface_type`
- `engine`
- `created_from_session_id`
- `created_from_artifact_ids`
- `created_from_version_ids`
- `request_snapshot`
- `latest_runnable_state`
- `replaces_artifact_id`
- `refine_parent_artifact_id`

Exact wire names may evolve, but these semantics must not disappear.

## 5. Selection anchor baseline

Selections should use a stable anchor object instead of arbitrary prompt text.

Target shape:

```json
{
  "scope": "paragraph",
  "anchor_id": "para_12",
  "artifact_id": "artifact_xxx",
  "version_id": "version_xxx",
  "label": "教学目标第二段",
  "path": ["sections", 2, "paragraphs", 1],
  "range": { "start": 120, "end": 188 }
}
```

Rules:

- `scope` is mandatory
- `anchor_id` is mandatory whenever the artifact format can support stable ids
- `artifact_id` is mandatory for artifact-targeted refine
- `version_id` is strongly preferred when a versioned source exists
- `path` and `range` are optional helpers, not substitutes for stable ids

## 6. Refine metadata baseline

### 6.1 `chat_refine`

Target metadata:

- current artifact or session reference
- optional source artifact references
- optional selection anchor
- user instruction
- last runnable state snapshot

### 6.2 `structured_refine`

Target metadata:

- stable selection anchor
- operation intent
  - examples: `rewrite`, `expand`, `replace`, `reorder`
- optional structured payload

### 6.3 `follow_up_turn`

Target metadata:

- loop anchor or turn anchor
- actor input
  - for example `teacher_answer`
- current simulator state snapshot
- next focus hint if available

`follow_up_turn` should not be disguised as ordinary content rewrite.

## 7. Source-binding baseline

Source binding should become a first-class contract object rather than an incidental request field.

Target shape:

```json
{
  "required": true,
  "mode": "single_artifact",
  "accepted_types": ["pptx"],
  "selected_ids": ["artifact_ppt_123"],
  "visibility_scope": "project-visible",
  "status": "bound"
}
```

Rules:

- source requirements must be discoverable from the capability catalog
- candidate source lists must come from the backend
- source visibility and permission checks are backend-owned
- stale or unauthorized source ids must fail explicitly
- multi-source is opt-in and card-specific, not assumed

## 8. Latest runnable state

Each Studio execution result should preserve a compact state snapshot that allows later operations to resume without guessing.

Minimum semantics:

- which carrier is primary right now
- which artifact/session id is currently active
- whether refine is allowed
- whether follow-up turn is allowed
- whether source binding is still valid
- what the next recommended action is

This state should be returned in execution and refine results, not only reconstructed in the frontend.

## 9. Forward compatibility rule for `studio-cards`

Current public routes can remain:

- `GET /studio-cards`
- `GET /studio-cards/{card_id}`
- `GET /studio-cards/{card_id}/execution-plan`
- `POST /studio-cards/{card_id}/execution-preview`
- `POST /studio-cards/{card_id}/execute`
- `POST /studio-cards/{card_id}/draft`
- `POST /studio-cards/{card_id}/refine`
- card-specific turn routes where needed

But future iterations should converge toward:

- explicit anchor schema
- explicit refine mode
- explicit execution carrier
- explicit latest runnable state
- explicit source-binding object

## 10. Adoption checks

This baseline is acceptable only if all future decisions satisfy these checks:

- any candidate wheel can map onto `artifact/source/refine` semantics cleanly
- any backend flow can explain its `session / artifact / hybrid` carrier
- any selection-aware feature can point to a stable anchor model
- any refine feature can declare which refine mode it belongs to
- any artifact replacement preserves lineage instead of overwriting history

## 11. Test template that future implementation should follow

### Frontend

- unified capability header renders correctly
- source-binding requirement is visible and enforced
- refine entry reflects the correct refine mode
- artifact surface renders only real outputs, not fake placeholders

### Backend

- `execute`, `draft`, `refine`, and `turn` map cleanly to state transitions
- source-binding permission and invalidation are tested
- artifact provenance and latest runnable state are written and returned

### End-to-end

- one document card
- one quiz/single-item card
- one graph card
- one simulation card

Each should complete a real round-trip without inventing mock artifact semantics.
