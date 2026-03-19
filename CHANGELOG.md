# Changelog

## 2026-03-19

### Summary

- Completed a staged backend architecture cleanup focused on large-file拆分, `folder-as-module`, router/service职责回归, and service topology收口.
- Kept the work incremental: each refactor was validated with targeted tests and repeated full `pytest` / frontend checks.
- Reached a stable stop point for the current iteration: the worst coupling hotspots were reduced without attempting a risky full rewrite.

### Backend Router Refactors

- Split `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions.py` into:
  - `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/__init__.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/core.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/commands.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/preview.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/shared.py`
- Split `/Users/ln1/Projects/Spectra/backend/routers/chat.py` into:
  - `/Users/ln1/Projects/Spectra/backend/routers/chat/__init__.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/chat/shared.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/chat/message_flow.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/chat/messages.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/chat/voice.py`
- Split `/Users/ln1/Projects/Spectra/backend/routers/rag.py` into:
  - `/Users/ln1/Projects/Spectra/backend/routers/rag/__init__.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/rag/core.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/rag/enrichment.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/rag/shared.py`
- Split `/Users/ln1/Projects/Spectra/backend/routers/project_space.py` into:
  - `/Users/ln1/Projects/Spectra/backend/routers/project_space/__init__.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/project_space/versions.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/project_space/artifacts.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/project_space/references.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/project_space/members.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/project_space/shared.py`
- Split `/Users/ln1/Projects/Spectra/backend/routers/projects.py` into:
  - `/Users/ln1/Projects/Spectra/backend/routers/projects/__init__.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/projects/listing.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/projects/detail.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/projects/shared.py`
- Split `/Users/ln1/Projects/Spectra/backend/routers/files.py` into:
  - `/Users/ln1/Projects/Spectra/backend/routers/files/__init__.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/files/uploads.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/files/mutations.py`
  - `/Users/ln1/Projects/Spectra/backend/routers/files/shared.py`
- Removed stale router export for the missing `courses_router`.

### Router Logic Sunk Into Services

- Moved `files` upload and batch-upload orchestration into `/Users/ln1/Projects/Spectra/backend/services/file_upload_service/`.
- Moved `projects` API assembly and project ownership workflows into `/Users/ln1/Projects/Spectra/backend/services/project_api_service.py`.
- Moved `rag` retrieval, source detail, enrichment, and optional auto-indexing workflows into `/Users/ln1/Projects/Spectra/backend/services/rag_api_service/`.
- Continued shrinking routers so they primarily perform request parsing, auth, service delegation, and response return.

### Backend Service Refactors

- Broke the old giant generation session implementation into `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/`, including:
  - `service.py`
  - `command_api.py`
  - `query_api.py`
  - `task_runtime.py`
  - `command_handlers.py`
  - `queries.py`
  - `event_store.py`
  - `lifecycle.py`
  - `outline_helpers.py`
  - `capability_helpers.py`
  - `serialization_helpers.py`
  - `task_dispatch.py`
  - `outline_draft/scheduling.py`
  - `outline_draft/execution.py`
- Broke `/Users/ln1/Projects/Spectra/backend/services/task_executor.py` into `/Users/ln1/Projects/Spectra/backend/services/task_executor/`, including `generation.py`, `generation_runtime.py`, `generation_error_handling.py`, `outline.py`, `requirements.py`, `indexing.py`, and `common.py`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/database.py` into `/Users/ln1/Projects/Spectra/backend/services/database/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/project_space_service.py` into `/Users/ln1/Projects/Spectra/backend/services/project_space_service/` and then continued splitting `artifact_api.py`, `member_api.py`, `reference_api.py`, `review.py`, `members.py`, `references.py`, `access.py`, and `project_records.py`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/preview_helpers.py` into `/Users/ln1/Projects/Spectra/backend/services/preview_helpers/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/prompt_service.py` into `/Users/ln1/Projects/Spectra/backend/services/prompt_service/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/network_resource_strategy.py` into `/Users/ln1/Projects/Spectra/backend/services/network_resource_strategy/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/file_parser.py` into `/Users/ln1/Projects/Spectra/backend/services/file_parser/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/task_queue.py` into `/Users/ln1/Projects/Spectra/backend/services/task_queue/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/artifact_generator.py` into `/Users/ln1/Projects/Spectra/backend/services/artifact_generator/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/rag_service.py` into `/Users/ln1/Projects/Spectra/backend/services/rag_service/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/ai.py` into `/Users/ln1/Projects/Spectra/backend/services/ai/`.
- Broke `/Users/ln1/Projects/Spectra/backend/services/courseware_ai.py` into `/Users/ln1/Projects/Spectra/backend/services/courseware_ai/`.

### App Setup And Imports

- Extracted FastAPI app assembly out of `/Users/ln1/Projects/Spectra/backend/main.py` into:
  - `/Users/ln1/Projects/Spectra/backend/app_setup/factory.py`
  - `/Users/ln1/Projects/Spectra/backend/app_setup/routes.py`
  - `/Users/ln1/Projects/Spectra/backend/app_setup/middleware.py`
  - `/Users/ln1/Projects/Spectra/backend/app_setup/lifespan.py`
  - `/Users/ln1/Projects/Spectra/backend/app_setup/exceptions.py`
- Reduced hidden coupling by shifting production imports away from broad `from services import ...` usage and toward explicit module paths.

### Service Topology

- Started higher-level service grouping so `/Users/ln1/Projects/Spectra/backend/services/` is no longer only a flat namespace.
- Grouped media-oriented services under `/Users/ln1/Projects/Spectra/backend/services/media/`:
  - `audio.py`
  - `video.py`
  - `web_search.py`
  - `embedding.py`
  - `vector.py`
  - `rag_indexing.py`
- Added `/Users/ln1/Projects/Spectra/docs/service-topology-todo.md` to track staged grouping work and remaining candidates.

### Frontend

- Removed the duplicated `/Users/ln1/Projects/Spectra/frontend/lib/api` implementation.
- Consolidated frontend requests onto `/Users/ln1/Projects/Spectra/frontend/lib/sdk`.
- Fixed follow-up type/build issues uncovered during the consolidation and verified frontend `lint`, `test`, and `build`.

### Tooling And Dev Experience

- Added `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py` with graded thresholds:
  - `>300` lines => warning
  - `>500` lines => error
  - `>800` lines => critical
- Used the guard to drive cleanup of flat service modules; warnings were reduced from `7` to `1`.
- Improved Docker dev build performance:
  - added `/Users/ln1/Projects/Spectra/frontend/.dockerignore`
  - added `/Users/ln1/Projects/Spectra/backend/.dockerignore`
  - optimized `/Users/ln1/Projects/Spectra/frontend/Dockerfile.dev`
  - optimized `/Users/ln1/Projects/Spectra/backend/Dockerfile.dev`
- Preserved validation discipline throughout the refactor by repeatedly running targeted API/service tests, frontend checks, and backend full test suites.

### Documentation

- Added `/Users/ln1/Projects/Spectra/docs/next-stage-architecture-optimization.md`.
- Refreshed `/Users/ln1/Projects/Spectra/docs/standards/backend.md` to reflect current layering, `folder-as-module`, explicit import guidance, and guard usage.
- Refreshed `/Users/ln1/Projects/Spectra/docs/standards/README.md`.
- Refreshed `/Users/ln1/Projects/Spectra/README.md`.
- Refreshed `/Users/ln1/Projects/Spectra/backend/README.md`.
- Refreshed `/Users/ln1/Projects/Spectra/backend/services/README.md`.
- Fixed garbled Chinese comments in `/Users/ln1/Projects/Spectra/backend/services/courseware_ai/`.
