# Managed Artifact Lifecycle

> Status: `active design`
> Updated: `2026-04-21`
> Purpose: define one shared Studio managed-tool artifact model that matches current Ourograph formal state instead of inventing a second artifact/version truth source inside Spectra.

Implementation note:

- Phase 1 code integration has started for `word_document` and `knowledge_mindmap`
- current implementation target is: `new draft -> new artifact`, `refine/save -> update same artifact`, `history click -> pinned artifact`

## 1. Why this exists

Current Studio managed tools already show the same failure pattern:

- old results can reappear as if they were still current
- preview and export can resolve against different anchors
- `run`, `artifact`, and `session latest` are all treated as competing truth sources
- each tool grows its own local fallback chain when exact matching fails

This is not a Word-only bug.

It is a shared lifecycle-model gap across artifact-backed or hybrid Studio cards.

If the next managed card is added without one shared lifecycle contract, the same confusion will recur under a different surface.

## 2. Locked product decisions

These decisions are fixed for this design unless a later design doc explicitly replaces them:

- left-side / top-left tool entry opens a fresh draft flow, not the latest result
- history is an `artifact` list, not a version list
- one new create flow creates one new `artifact`
- refine / save / follow-up update the same `artifact`, not a new visible artifact entry
- the same session may contain multiple artifacts of the same tool type
- `run` is execution / audit / recovery state, not the default result-selection anchor
- Studio Phase 1 does not expose artifact version history as a first-class UI surface

This means the user-visible model is:

- `new draft` = prepare a new artifact
- `history click` = reopen one existing artifact
- `save/refine` = advance that artifact's latest visible state

## 3. Ourograph Reality Check

Studio design must align with Ourograph's current formal implementation, not with an aspirational artifact-version model.

Current Ourograph formal objects are:

- `Project`
- `ProjectVersion`
- `ProjectReference`
- `Artifact`
- `CandidateChange`
- `Member`

Current implementation evidence:

- `ArtifactRecord` is a single artifact record with stable `id`, `projectId`, `sessionId`, `basedOnVersionId`, `metadata`, `createdAt`, and `updatedAt`
  - see [ourograph/src/main/kotlin/io/ln1/ourograph/domain/model/FormalRecords.kt](../../../ourograph/src/main/kotlin/io/ln1/ourograph/domain/model/FormalRecords.kt)
- `ArtifactVersionSemantics` currently exposes:
  - `createArtifact`
  - `updateArtifactMetadata`
  - `bindArtifactToVersion`
  - see [ourograph/src/main/kotlin/io/ln1/ourograph/application/artifactversion/ArtifactVersionSemantics.kt](../../../ourograph/src/main/kotlin/io/ln1/ourograph/application/artifactversion/ArtifactVersionSemantics.kt)
- current database schema has:
  - `artifact`
  - `project_version`
  - no `artifact_version` table
  - see [ourograph/src/main/resources/db/migration/V1__create_ourograph_tables.sql](../../../ourograph/src/main/resources/db/migration/V1__create_ourograph_tables.sql)

Therefore this design must not claim that Ourograph already owns a first-class `ArtifactVersion` object.

For current Spectra design, the formal truth is:

- `Artifact` = stable user-visible artifact identity
- `ProjectVersion` = formal project-level version anchor
- `Run` = Spectra execution record

If later we need a formal `ArtifactVersion` object, that must be designed and landed in Ourograph first.

## 4. Canonical lifecycle model

### 4.1 Core objects

- `Artifact`
  - stable user-visible artifact identity
  - the object shown in Studio history
  - can be reopened directly by `artifact_id`
  - may be updated in place through metadata/content refresh semantics
- `ProjectVersion`
  - formal project-space version anchor already owned by Ourograph
  - used through `basedOnVersionId` and `currentVersionId`
- `Run`
  - one Spectra execution record
  - records progress, status, timing, and provenance of how artifact state changed
- `Artifact internal evolution`
  - an internal notion of latest state, metadata lineage, or future versioning
  - not a first-class Ourograph formal object in this phase

### 4.2 Core rules

- every new managed-tool draft that becomes durable creates one new `Artifact`
- refine / save / follow-up update the same artifact's latest visible state
- the history surface lists artifacts, not artifact versions
- the same session may contain multiple artifacts for the same tool type
- `Run` may explain how an artifact changed, but it does not define which artifact the user is currently opening

### 4.3 UI entry head vs artifact-local latest state

This design distinguishes two different meanings of "head".

`UI entry head`

- there is no capability-level default current-head entry in this phase
- managed tool entry from the left-side / top-left tool button always opens `DraftTarget`

`artifact-local latest state`

- when a user opens one artifact from history, Studio shows that artifact's latest visible state
- this may be described as the artifact's latest state or artifact-local head
- it must not be described as the default `{session_id, tool_type}` current head

This distinction keeps internal latest/superseded semantics available without turning them into the default Studio entry rule.

## 5. Resolution targets

Studio should converge on three active managed-tool targets plus one debug-only target.

### 5.1 `DraftTarget`

Use when:

- user clicks a managed tool from the left-side / top-left entry
- user explicitly starts a new draft
- no existing artifact should be reopened automatically

Resolution:

- draft/config state only
- no automatic binding to the latest artifact in the session
- stale historical artifact data must not overwrite the draft surface

### 5.2 `PinnedArtifactTarget`

Use when:

- user opens one history entry
- user reopens a specific artifact from a chat/history/control-surface link

Resolution:

- fixed `artifact_id`
- open that artifact's latest visible state
- no fallback to session latest
- no fallback to tool latest
- no fallback to run

### 5.3 `PinnedRunTarget`

Use when:

- user intentionally inspects a historical execution
- debugging, audit, or recovery needs that exact run

Resolution:

- fixed `run_id`
- may resolve a related artifact for display support
- does not replace normal managed-tool entry behavior

### 5.4 Removed phase-1 default: `CurrentHeadTarget`

The previous idea that "normal managed-tool open = `{session_id, tool_type}` current head" is explicitly removed from this design.

That behavior does not match current product intent and should not remain in the design doc as a hidden default assumption.

## 6. Frontend truth-source rules

### 6.1 One resolver only

All managed tools should use one shared resolver that returns:

- target type
- artifact id when pinned to an artifact
- run id only when explicitly run-scoped
- session id
- tool type
- whether the surface is draft or pinned artifact

Preview, export, title display, history reopen, chat refine, and structured refine must all consume the same resolved target.

### 6.2 No mixed-anchor requests

A request must not combine:

- `artifact_id` from one resolved object
- `run_id` from another resolved object

If preview/export/refine is artifact-scoped, send one artifact-scoped request.

If a debug flow is run-scoped, send one run-scoped request.

Do not synthesize hybrid requests from multiple candidate records.

### 6.3 No session fallback for artifact reopening

The following pattern must be removed from normal managed-tool reopening:

- exact artifact match
- else exact run match
- else any item in the same session

That chain is acceptable only for explicit degraded recovery tooling, not for normal user-facing result resolution.

## 7. History surface semantics

Studio history for managed tools should be treated as an artifact list.

Rules:

- each history row corresponds to one `Artifact`
- the row represents that artifact's latest visible state
- history does not enumerate version lineage in this phase
- multiple artifacts of the same tool type may appear in the same session
- refine/save/follow-up update the existing artifact row
- creating a new draft that becomes durable creates a new artifact row

This means:

- history is not a version browser
- history is not a `{session, tool}` singleton state view
- history is not a run list

## 8. Tool-specific application

### 8.1 `word_document`

Target behavior:

- normal entry opens `DraftTarget`
- first durable create makes a new `Artifact`
- later save/refine updates that same artifact's latest visible state
- direct edit/save is content-replacement editing and must bypass RAG / AI rewrite
- chat refine remains a separate instruction-driven path and may still use AI rewrite + RAG
- history click uses `PinnedArtifactTarget`
- preview and export use the same resolved artifact target
- no session-wide "latest Word result" fallback is allowed when reopening a specific artifact

### 8.2 `knowledge_mindmap`

Target behavior:

- normal entry opens `DraftTarget`
- new create makes a new artifact
- later refine/edit updates that artifact
- history click uses `PinnedArtifactTarget`
- any existing replacement/latest filtering must be treated as artifact-local latest-state logic, not as capability-level default entry logic

### 8.3 Later managed tools

The same model should later apply to:

- `interactive_quick_quiz`
- `interactive_games`
- `speaker_notes`
- `demonstration_animations`
- `classroom_qa_simulator`

They may differ in surface adapter and refine mode, but not in artifact identity rules.

## 9. Acceptance scenarios

- clicking the Word or Mindmap tool entry always opens a new draft/config flow
- no existing artifact auto-opens when entering from the normal tool button
- creating Word twice in the same session produces two Word artifacts in history
- refining one Word artifact multiple times keeps one history row for that artifact
- reopening one artifact from history always resolves by `artifact_id`
- reopening one artifact from history must not be overwritten by another artifact of the same tool type in the same session
- `run` may assist processing, audit, and recovery, but does not decide the default managed-tool result
- the design must not require frontend to derive one unique current result from `{session_id, tool_type}`

## 10. Hard rules

- no new managed tool may invent its own result-selection chain
- no tool may treat `run` and `artifact` as simultaneous default truth sources
- no preview/export pair may resolve against different anchors
- no design doc may claim Ourograph already has formal `ArtifactVersion` state when it does not
- no Spectra-local module may become a second formal artifact/version truth source ahead of Ourograph

## 11. Future evolution

Future work may introduce a first-class artifact-version model, but only under these conditions:

- the need is real and repeated
- the formal model is designed in Ourograph first
- the migration path from current `Artifact + ProjectVersion` semantics is explicit

Until then, this design treats artifact internal evolution as:

- metadata / lineage / latest-state semantics
- future extensibility
- not current formal ontology
