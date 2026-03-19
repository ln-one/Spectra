# Changelog

## 2026-03-19

### Architecture

- Split large router/service files into folder-as-module structures across chat, rag, files, projects, project_space, generate_sessions, task_executor, database, preview, prompt, and AI-related modules.
- Extracted FastAPI app assembly out of `/Users/ln1/Projects/Spectra/backend/main.py` into `/Users/ln1/Projects/Spectra/backend/app_setup/`.
- Reduced hidden service coupling by moving production imports toward explicit module paths.
- Added `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py` with graded thresholds:
  - `>300` lines => warning
  - `>500` lines => error
  - `>800` lines => critical
- Introduced service topology planning and partial service grouping documentation in `/Users/ln1/Projects/Spectra/docs/service-topology-todo.md`.

### Service Topology

- Grouped media-oriented services under `/Users/ln1/Projects/Spectra/backend/services/media/`:
  - `audio.py`
  - `video.py`
  - `web_search.py`
  - `embedding.py`
  - `vector.py`
  - `rag_indexing.py`
- Reduced architecture guard warnings from 7 to 1.

### Frontend

- Removed duplicated API source and consolidated frontend requests onto `/Users/ln1/Projects/Spectra/frontend/lib/sdk`.

### Docs

- Added next-stage architecture optimization notes in `/Users/ln1/Projects/Spectra/docs/next-stage-architecture-optimization.md`.
- Updated backend standards to reflect current structure and architecture guard usage.
- Added service topology TODO for staged grouping work.

### Tooling

- Improved Docker dev build performance with `.dockerignore`, cache-aware installs, and dependency layer cleanup.
