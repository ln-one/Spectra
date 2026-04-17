# Backend

> Status: `current`
> Role: backend runtime entry for the Spectra workflow shell.

The FastAPI backend is now the Spectra workflow shell. It owns Session, events,
task orchestration, API aggregation, download binding, and anti-corruption
layers around the six authority services; formal product capabilities live in
those external services.

More precisely, Spectra backend should now be read as:

- a `workflow shell`
- an `orchestration kernel`
- a `contract surface`

It is not a traditional monolith, and it is not a hollow gateway. It still
retains a few local support organs, but they must remain explicitly classified
and must not regrow into second capability authorities.

## Key Directories

- `/Users/ln1/Projects/Spectra/backend/main.py`: the thinnest possible entrypoint
- `/Users/ln1/Projects/Spectra/backend/app_setup/`: FastAPI assembly
- `/Users/ln1/Projects/Spectra/backend/routers/`: HTTP routing layer
- `/Users/ln1/Projects/Spectra/backend/services/`: business and infrastructure capabilities
- `/Users/ln1/Projects/Spectra/backend/schemas/`: Pydantic models
- `/Users/ln1/Projects/Spectra/backend/tests/`: pytest suites

## Current Service Partitions

### workflow shell
- `ai/`
- `prompt_service/`
- `generation_session_service/`
- `platform/`
- `preview_helpers/`
- `task_queue/`
- `task_executor/`
- `application/project_api.py`
- `application/file_management.py`

These are kernel organs that Spectra should continue to own.

### external capability adapters
- `diego_client.py`: Diego AI PPT generation
- `render_engine_adapter.py`: Pagevra legacy structured compatibility adapter for `/render/*`
- `ourograph_client.py`: Ourograph formal project-space state
- `platform/dualweave_client.py`: Dualweave upload/parse workflow
- `stratumind_client.py`: Stratumind retrieval/vector recall
- `platform/limora_client.py`: Limora identity container
- `project_space_service/`: thin Ourograph facade only

These are anti-corruption layers, not upstream domain owners.

### transitional local support
- `database/`
- `media/`
- `rag_api_service/`
- `file_parser/`
- `artifact_generator/`: non-office file helpers only

These are allowed only as local support organs. They must not redefine formal
product truth or bypass the six authority services.

### residual legacy watchlist

- `generation/`
- `generation_session_service/outline_draft/` residual shadow area; current source should not regrow there
- any module that makes backend look like it still owns formal render / state / identity truth

Do not add backend-local replacements for the six authority services.

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

## Stable Test Entry (Windows)

To avoid accidentally using system/Anaconda Python, run pytest via the repo venv wrapper:

```powershell
cd backend
.\scripts\run_pytest.ps1 -m "not integration and not slow"
```

## Development Constraints

- routers should not accumulate complex business orchestration
- new production code must use explicit imports; `from services import ...` is tests-only compatibility
- files above `300` lines deserve review; above `500` lines should normally be split
- new modules should prefer the folder-as-module pattern when complexity warrants it
- backend-local Marp/Pandoc/PPTX/DOCX generation is not a production path; prefer Diego authority artifacts and Pagevra compile/preview outputs before any structured compatibility render
- `project_space_service` is a facade over Ourograph, not a formal-state implementation

## Read Alongside This

- `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
- `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
- `/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md`
- `/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md`
- `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
