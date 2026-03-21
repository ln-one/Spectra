# Backend

The FastAPI backend has moved from a flat, oversized structure into a package-oriented layout with clearer partitions and stronger semantic boundaries.

## Key Directories

- `/Users/ln1/Projects/Spectra/backend/main.py`: the thinnest possible entrypoint
- `/Users/ln1/Projects/Spectra/backend/app_setup/`: FastAPI assembly
- `/Users/ln1/Projects/Spectra/backend/routers/`: HTTP routing layer
- `/Users/ln1/Projects/Spectra/backend/services/`: business and infrastructure capabilities
- `/Users/ln1/Projects/Spectra/backend/schemas/`: Pydantic models
- `/Users/ln1/Projects/Spectra/backend/tests/`: pytest suites

## Current Service Partitions

### application
- `file_upload_service/`
- `application/project_api.py`
- `application/file_management.py`
- `rag_api_service/`
- `project_space_service/`

### generation
- `generation_session_service/`
- `courseware_ai/`
- `preview_helpers/`
- `artifact_generator/`
- `task_executor/`

### media
- `media/audio.py`
- `media/video.py`
- `media/web_search.py`
- `media/embedding.py`
- `media/vector.py`
- `media/rag_indexing.py`

### platform
- `platform/`
- `ai/`
- `ai/model_router.py`
- `prompt_service/`
- `database/`
- `task_queue/`
- `auth_service.py`

## Common Commands

```bash
cd backend
black .
isort .
flake8 .
pytest
python3 scripts/architecture_guard.py
uvicorn main:app --reload
```

## Development Constraints

- routers should not accumulate complex business orchestration
- new production code should prefer explicit imports over `from services import ...`
- files above `300` lines deserve review; above `500` lines should normally be split
- new modules should prefer the folder-as-module pattern when complexity warrants it

## Read Alongside This

- `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
- `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
- `/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md`
- `/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md`
- `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
