# Studio Backend Orchestration Model

> Status: `active design`
> Updated: `2026-04-17`
> Purpose: define how Studio cards should map onto backend orchestration without inventing shadow authorities.

## 1. Boundary reminder

Per [AGENTS.md](../../../AGENTS.md), Spectra backend is a workflow shell, orchestration kernel, and contract surface.

For Studio this means:

- backend owns session/run/event coordination
- backend owns contract shaping, artifact binding, and lineage
- backend may adapt external or local capability engines
- backend must not become a second domain owner for document editing, graph editing, animation rendering, or sandbox execution semantics

## 2. Current code anchors

The present Studio orchestration already spans:

- capability declaration
  - [backend/services/generation_session_service/card_catalog.py](../../../backend/services/generation_session_service/card_catalog.py)
- request preview and protocol shaping
  - [backend/services/generation_session_service/card_execution_preview.py](../../../backend/services/generation_session_service/card_execution_preview.py)
- execution runtime
  - [backend/services/generation_session_service/card_execution_runtime.py](../../../backend/services/generation_session_service/card_execution_runtime.py)
- route surface
  - [backend/routers/generate_sessions/studio_cards.py](../../../backend/routers/generate_sessions/studio_cards.py)

This design should converge those paths rather than replace them with a parallel system.

## 3. Canonical orchestration verbs

Studio should converge on these verbs:

- `sources`
  - return bindable source artifacts or source candidates
- `execution-preview`
  - shape validated intent into a runnable backend request preview
- `execute`
  - perform the first concrete action against the chosen carrier
- `draft`
  - create a draft or preview-grade output when the card meaningfully supports draft semantics
- `refine`
  - modify or continue from an existing artifact/session state
- `turn`
  - continue a loop where the primary semantic is another interaction round rather than simple rewrite

These verbs are orchestration verbs, not direct product semantics.

## 4. Carrier model

Every card must declare one primary carrier:

- `session`
  - the living state is chiefly a session/run
- `artifact`
  - the living state is chiefly the artifact and its replacements
- `hybrid`
  - both session and artifact are first-class

### 4.1 Carrier mapping by card

| Card | Primary carrier | Why |
| --- | --- | --- |
| `courseware_ppt` | `hybrid` | outline, generation session, artifact export, and later refine all matter |
| `word_document` | `hybrid` | creation often starts from a session context but resolves to a durable doc artifact |
| `speaker_notes` | `hybrid` | source-bound derivative plus editable script artifact |
| `interactive_quick_quiz` | `artifact` | result is primarily a question artifact |
| `knowledge_mindmap` | `artifact` | result is primarily a graph-like artifact |
| `interactive_games` | `artifact` | generated HTML artifact is the main durable result |
| `demonstration_animations` | `artifact` | storyboard/media artifact is the main result |
| `classroom_qa_simulator` | `hybrid` | loop state and artifact/script summary both matter |

## 5. Refine taxonomy

`refine` is currently overloaded. Future implementation should distinguish three semantics while still allowing one route surface initially.

### 5.1 `chat_refine`

Use when:

- instruction is freeform
- target is the current artifact/session context
- backend mainly needs to assemble context and pass it through a controlled prompt/runtime

Return:

- updated session continuation or replacement artifact
- updated lineage metadata

### 5.2 `structured_refine`

Use when:

- request targets a formal anchor or structured field
- selection or object identity matters

Return:

- updated artifact content
- anchor-aware change metadata

### 5.3 `follow_up_turn`

Use when:

- the user is not rewriting content but advancing a live loop
- the result should append or transition the current state

Return:

- next turn object
- next runnable state
- optional artifact/session summary snapshot

`classroom_qa_simulator` is the first mandatory user of this distinction.

## 6. State orchestration rule

Cards with phaseful execution must expose formal backend state transitions, not only UI-level booleans.

Minimum backend states:

- `idle`
- `awaiting_requirements`
- `preview_ready`
- `queued`
- `running`
- `artifact_available`
- `awaiting_refine`
- `awaiting_follow_up`
- `completed`
- `failed`

These names do not need to be the final wire format immediately, but route responses and events must be mappable to them.

## 7. Artifact binding and replacement

Backend is responsible for:

- creating or binding the resulting artifact
- preserving replacement lineage where refine generates a successor
- keeping source artifact bindings visible
- storing an execution request snapshot sufficient to explain how the result was produced

Backend is not responsible for:

- being the long-term owner of a rich editor's internal transient state
- inventing alternate render engines when an external or dedicated engine exists

## 8. Source binding model

Source binding should be formalized as backend-owned orchestration metadata.

Rules:

- source requirements are declared in the capability catalog
- `sources` returns valid candidates, not frontend-guessed lists
- invalid, missing, or unauthorized source bindings fail explicitly
- source binding remains visible on the resulting artifact/session metadata
- multi-source binding is opt-in and card-specific

Expected first-class users:

- `word_document`
- `speaker_notes`
- future cards that derive from `courseware_ppt`

## 9. Selection-context rule

Selections are not arbitrary prompt attachments. They must be formal anchors.

Allowed first-class scopes:

- `page`
- `paragraph`
- `node`
- `question`
- `scene`

Backend should preserve:

- anchor scope
- anchor id
- optional path/range payload
- human-facing label
- artifact/version/session reference

This belongs in refine metadata and artifact provenance, not only in transient request bodies.

## 10. Draft semantics

`draft` should remain available only when it means something real.

Good uses:

- preview-grade word/script output before final artifact promotion
- lightweight intermediate animation/storyboard preparation

Bad uses:

- "fake success" placeholders
- low-quality local fallback outputs that pretend the main system succeeded

If a card cannot produce a meaningful draft, it should fail explicitly or skip `draft` entirely.

## 11. Anti-shadow-authority rules

The backend must not quietly become:

- a backup document engine
- a backup graph editor
- a backup video compositor
- a backup multi-agent runtime

It may own:

- request normalization
- capability routing
- execution policy
- lineage binding
- result shaping
- queue/run lifecycle

## 12. Recommended implementation sequence

1. normalize carrier and refine semantics in route/service payloads
2. formalize source-binding and selection-anchor metadata
3. add backend state vocabulary mapping for card lifecycle events
4. deepen one document card and one loop card against that contract
5. only then expand specialized engines for graph/media/sandbox cards
