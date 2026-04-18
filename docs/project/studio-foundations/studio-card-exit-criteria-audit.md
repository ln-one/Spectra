# Studio Card Exit Criteria Audit

> Status: `current`
> Updated: `2026-04-18`
> Purpose: record whether Studio cards have reached the pre-uplift convergence bar defined in `studio-cards-iteration-roadmap.md`.

## Current audit rule

Each active Studio card should be able to point to:

- one artifact truth
- one payload normalizer
- one surface adapter
- one formal refine or turn entry

This audit is not a new design doc. It is a current-truth checkpoint used to decide whether Studio can stop horizontal restructuring and enter documentation-led stability.

## Current matrix

| Card | Artifact truth | Payload normalizer | Surface adapter | Formal refine / turn entry | Status |
| --- | --- | --- | --- | --- | --- |
| `word_document` | `word_document` content + `docx` artifact | `normalize_word_document_payload` | `DocumentSurfaceAdapter` | `refine_word_document_content` | `meets exit bar` |
| `interactive_quick_quiz` | `quiz` question JSON + `exercise` artifact | `normalize_interactive_quick_quiz_payload` | `QuizSurfaceAdapter` | `refine_quiz_content` | `meets exit bar` |
| `knowledge_mindmap` | `mindmap` tree JSON + `mindmap` artifact | `normalize_knowledge_mindmap_payload` | `GraphSurfaceAdapter` | `refine_mindmap_content` | `meets exit bar` |
| `speaker_notes` | `speaker_notes.v2` JSON + `summary` artifact | `normalize_speaker_notes_payload` | `SpeakerNotesSurfaceAdapter` | `refine_speaker_notes_content` | `meets exit bar` |
| `classroom_qa_simulator` | `classroom_qa_simulator.v2` turn JSON + `summary` artifact | no dedicated payload normalizer yet | preview shell inline, no dedicated surface adapter yet | `turn` + `simulator_turn_generation` | `partial` |
| `interactive_games` | `interactive_game` HTML artifact + compatibility metadata | `normalize_interactive_game_payload` | `GameSurfaceAdapter` | `refine_interactive_game_legacy_content` | `contained freeze zone` |
| `demonstration_animations` | `animation_storyboard` artifact + placement lineage | `normalize_demonstration_animation_payload` | preview shell inline, no dedicated surface adapter yet | `refine_animation_content` + placement binding | `partial` |

## Current interpretation

- `word_document`, `interactive_quick_quiz`, `knowledge_mindmap`, and `speaker_notes` have reached the intended convergence bar.
- `interactive_games` is acceptable only as a frozen compatibility zone; it is not an uplift-ready card and must not grow new local product truth.
- `classroom_qa_simulator` still lacks one explicit payload normalizer and one dedicated surface adapter, even though its formal `follow_up_turn` path is already in place.
- `demonstration_animations` already has contract-first artifact truth and formal refine/placement bindings, but still keeps preview logic inline instead of behind one dedicated surface adapter.

## Builder boundary check

Current backend boundary is acceptable for stability if it does not grow wider:

- `tool_content_builder.py` remains orchestration-only
- `tool_content_builder_routing.py` keeps explicit dedicated routing only where needed
- `studio_card_payload_normalizers.py` stays the single normalization entry for active structured cards
- frozen compatibility stays explicit in `interactive_games_legacy_adapter`
- structured refine stays centralized in `tool_refine_builder.dispatcher`

This means the remaining work before any future uplift is not new capability work. It is only:

- isolating the last residual inline surfaces
- adding explicit normalizer treatment where still implicit
- keeping the current truth frozen by tests and canonical docs
