# Card Engine Matrix

> Status: `active design`
> Updated: `2026-04-17`
> Purpose: decide which mature wheels Studio should adopt, reserve, or reject for each card class.

## 1. Adoption policy

Default policy:

- open source first
- a small SaaS layer is acceptable only if replaceable
- do not self-build commodity engines
- thin integration is preferred over local reinvention

## 2. Global do-not-build list

These are explicit no-build zones unless a future decision doc overrides them:

- rich-text editor core
- node/graph editing core
- workflow/state-machine foundation
- real-time collaboration and version-history substrate
- HTML game runtime/container
- media timeline and animation rendering engine
- generic artifact-workbench mental model
- general multi-agent runtime framework for simulation

## 3. Cross-cutting wheel decisions

| Concern | Preferred wheel | Decision | Why |
| --- | --- | --- | --- |
| Artifact work surface model | Anthropic Artifacts product pattern | `adopt now` | best reference for chat-controlled separate work surface |
| Structured AI output / generated UI | Vercel AI SDK concepts | `adopt now` | useful design baseline for schema-first outputs and generated components |
| Workflow/state orchestration | XState | `adopt now` | prevents boolean-sprawl in multi-phase cards |
| Rich text/document surface | Tiptap | `adopt now` | mature extension model and strong editing ergonomics |
| Collaboration/version substrate | Yjs via Hocuspocus/Tiptap stack | `reserve` | strong long-term fit, but not required on day one for every card |
| Read-only mindmap rendering | Markmap | `adopt now` | low-cost way to render real structured mindmaps |
| Editable node graph | React Flow | `reserve` | use when node editing becomes primary, not before |
| Animation runtime/rendering | Remotion | `reserve` | strong candidate, but validate against current artifact flow before committing |
| Sandbox container | browser `iframe sandbox` | `adopt now` | enough for current HTML artifact execution model |

## 4. Per-card matrix

| Card | Surface | Engine | Carrier | Refine mode | Wheel decision | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `courseware_ppt` | deck main chain | special main-chain flow | `session + artifact` | chat refine | preserve current special path | not normalized into generic card engine |
| `word_document` | `document` | `rich_text` | `hybrid` | `chat_refine`, later `structured_refine` | adopt Tiptap now, reserve Yjs | use as the primary document baseline |
| `speaker_notes` | `teleprompter` | `rich_text` | `hybrid` | `chat_refine`, later paragraph refine | adopt Tiptap now, reserve Yjs | same family as `word_document`, different presentation |
| `interactive_quick_quiz` | `flashcard` | `single_item` | `artifact` | `chat_refine` around current question | no heavy wheel now | keep UI light; do not invent a DSL player |
| `knowledge_mindmap` | `graph` | `node_graph` later, render-first now | `artifact` | `structured_refine` around selected node | adopt Markmap now, reserve React Flow | do not hand-roll zoom/pan/selection infrastructure |
| `classroom_qa_simulator` | `simulator` | `simulation_loop` | `hybrid` | `chat_refine`, `follow_up_turn` | no multi-agent framework now | keep loop explicit, do not import agent hype as architecture |
| `interactive_games` | `sandbox` | `sandbox_html` | `artifact` | artifact rewrite | adopt iframe sandbox now | do not build a custom runtime framework |
| `demonstration_animations` | `animation` | `media_timeline` | `artifact` | structured parameter update | reserve Remotion | validate storyboard-to-render contract first |

## 5. Adopt now

### 5.1 Tiptap for document-like surfaces

Adopt for:

- `word_document`
- `speaker_notes`

Reasons:

- mature extension ecosystem
- direct mapping to document/paragraph selections
- easy separation between read-only and editable modes
- future path to collaboration and comments through Yjs/Hocuspocus

Current integration principle:

- treat Tiptap as the surface engine
- keep artifact truth in Spectra/Ourograph semantics
- do not let editor-local document ids become the formal artifact ids

### 5.2 XState for card workflow control

Adopt for:

- `classroom_qa_simulator`
- `word_document`
- `speaker_notes`
- later any card with meaningful multi-step state

Reasons:

- current Studio work already shows phaseful flows
- explicit state names reduce drift across frontend/backend/UI/tests

### 5.3 Markmap for reading-first mindmaps

Adopt for current `knowledge_mindmap` rendering.

Reasons:

- low cost
- already aligned with read-mostly usage
- avoids early commitment to full graph editing complexity

### 5.4 Sandboxed iframe for HTML artifacts

Adopt for:

- `interactive_games`
- HTML animation previews where applicable

Reasons:

- matches current artifact-first HTML outputs
- keeps execution boundary clear
- avoids inventing a new runtime shell

## 6. Reserve for later

### 6.1 Yjs and Hocuspocus

Reserve rather than force immediately.

Use when:

- multi-user editing becomes product-critical
- version snapshots need richer UX
- comments and presence become first-class requirements

### 6.2 React Flow

Reserve for `knowledge_mindmap` when the card transitions from render-first to edit-first.

Trigger conditions:

- node drag/reposition becomes part of the core workflow
- branch-level operations exceed simple textual refine
- layout and edge editing become a visible product promise

### 6.3 Remotion

Reserve for `demonstration_animations`.

Trigger conditions:

- storyboard schema is stable enough to compile into a renderable scene graph
- output requirements for HTML/GIF/MP4 can share a common composition model
- server-side rendering cost is acceptable for current infra

## 7. Reject for now

- building a custom ProseMirror-like wrapper as a homegrown editor platform
- building an in-house graph engine for nodes, edges, pan, and zoom
- building a bespoke video timeline engine
- importing a generic multi-agent orchestration framework just because `classroom_qa_simulator` has multiple roles
- treating generated HTML as trusted app code without sandbox boundaries

## 8. Exit strategy rule

Every adopted wheel must have an exit strategy:

- `Tiptap`
  - content remains stored as Spectra-owned structured artifact content
- `XState`
  - workflow semantics remain in our event/state vocabulary
- `Markmap`
  - graph source remains markdown/tree JSON, not renderer-owned state
- `React Flow`
  - node graph schema remains backend-owned JSON
- `Remotion`
  - storyboard and render parameters remain artifact content, not component-local truth

If a wheel cannot preserve this rule, it is not acceptable as a foundation dependency.
