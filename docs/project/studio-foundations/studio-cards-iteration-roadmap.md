# Studio Cards Iteration Roadmap

> Status: `active design`
> Updated: `2026-04-18`
> Purpose: turn Studio card evolution into a governed roadmap instead of ad hoc expansion.

## 1. Current decision

Studio cards should evolve by:

- shrinking the generic builder
- borrowing mature UI/runtime substrates where the market is already deep
- keeping Spectra-specific semantics in protocol, artifact, and source-binding layers
- converging all managed tools on one current-result lifecycle model

Lifecycle anchor:

- see [managed-artifact-lifecycle.md](./managed-artifact-lifecycle.md) for the shared `artifact identity / draft entry / pinned artifact / run` model that should govern managed-tool result selection

This roadmap explicitly does **not** start with:

- platform-wide realtime collaboration rollout
- durable orchestration re-platforming
- plugin system expansion
- authority replacement

## 2. Governance matrix

| Card | Governance | Cleanup priority | Surface strategy |
| --- | --- | --- | --- |
| `courseware_ppt` | `harden` | `p2` | authority workflow shell |
| `word_document` | `borrow` | `p1` | document surface adapter |
| `interactive_quick_quiz` | `defer` | `p2` | thin builder first |
| `interactive_games` | `freeze` | `p0` | freeze then runtime replacement |
| `knowledge_mindmap` | `borrow` | `p1` | graph surface adapter |
| `demonstration_animations` | `separate-track` | `p1` | separate runtime track |
| `speaker_notes` | `harden` | `p2` | anchored document surface |
| `classroom_qa_simulator` | `harden` | `p2` | turn-based simulation shell |

## 3. Immediate roadmap

### Phase 0

- publish card health metadata beside current capability metadata
- stop treating `FOUNDATION_READY` as the only maturity signal
- mark frozen cards explicitly in Studio UI

### Phase 1

- shrink `tool_content_builder*` back to orchestration + parse + validation
- isolate card-specific payload normalization and surface adapters
- treat `word_template_engine/*`, `game_template_engine/*`, `fallback.py`, and user-visible fallback paths as cleanup targets

### Phase 2

- `word_document`: validate `Tiptap` as the default document substrate
- `knowledge_mindmap`: validate `React Flow` as the default graph substrate

### Phase 3

- consolidate Studio workbench shell
- prevent each card from growing its own full product wrapper
- keep card variance inside explicit surface adapters

## 4. Reserve decisions

- `Yjs/Hocuspocus`: reserve for collaboration-heavy phase
- `Temporal`: reserve for orchestration-heavy phase
- `LangGraph/DeepEval`: reserve for simulator phase, not first-wave rollout
- `Phaser/Twine/p5.js`: reserve until `interactive_games` exits freeze

## 5. Hard rules

- no second PPT authority inside Studio card code
- no continued expansion of `interactive_games` template/fallback stack
- no new graph/canvas hand-rolling for `knowledge_mindmap`
- no new document-authority semantics inside `word_document` or `speaker_notes`

## 6. Final convergence before uplift

Before card-level uplift starts, Studio card code should converge to:

- `tool_content_builder.py` as protocol orchestration only
- explicit `STUDIO_CARD_BUILDERS` routing for card build paths
- explicit legacy adapters for frozen compatibility zones
- `ArtifactWorkbenchShell` plus per-card `*SurfaceAdapter` as the only preview structure

Exit criteria for uplift:

- frozen cards no longer grow standalone preview/product shells
- generic builder no longer carries new card-local truth
- active cards can point to one artifact truth, one normalizer, one surface adapter, and one refine/turn entry
- governance metadata, not `FOUNDATION_READY` alone, is the internal readiness signal

Current audit checkpoint:

- see [studio-card-exit-criteria-audit.md](./studio-card-exit-criteria-audit.md) for the current per-card convergence matrix and the remaining residual truth forks that still block formal uplift
