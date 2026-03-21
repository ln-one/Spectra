# Backend Agent Guide

Read the root [AGENTS.md](/Users/ln1/Projects/Spectra/AGENTS.md) first. This file only adds backend-specific entrypoints and constraints.

## Core Entry Points

- `main.py`: thin ASGI entry
- `app_setup/`: app assembly
- `routers/`: HTTP protocol only
- `services/ai/`: provider routing and AI invocation
- `services/generation_session_service/`: session lifecycle and commands
- `services/courseware_ai/`: outline/content generation semantics
- `services/task_executor/`: generation execution and artifact persistence
- `services/project_space_service/`: artifact/reference/member business APIs
- `services/rag_service/` and `services/media/`: retrieval, embeddings, vector access

## Backend Rules

- Keep `router -> service -> data/platform` layering explicit.
- Queue execution is primary; `local_async` is fallback only.
- Preview/export and final binary download are different contracts.
- Provider/model selection must come from config, not route-local hardcoding.
- `ALLOW_AI_STUB=false`, `ALLOW_COURSEWARE_FALLBACK=false`, `ALLOW_OFFICE_PLACEHOLDER_ARTIFACTS=false`, and `ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS=false` are the expected defaults.
- If Office rendering fails and placeholder artifacts are disabled, fail explicitly instead of silently producing fake PPTX/DOCX.
- If GIF/MP4 rendering is not implemented and media placeholders are disabled, fail explicitly instead of writing fake binary artifacts.
- Project owner is an implicit owner derived from `project.userId`; managed member APIs must not create duplicate owner memberships or mutate the owner's membership semantics.

## Validation

```bash
cd backend
python3 scripts/architecture_guard.py
pytest
```
