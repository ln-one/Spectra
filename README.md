# Spectra

Spectra is a multimodal AI teaching workspace for real instructional workflows: project materials, dialogue, generation sessions, preview-and-refine loops, and the project space all cooperate inside one system.

## Current State

The repository has completed its first major structural convergence:

- frontend APIs are unified in `/Users/ln1/Projects/Spectra/frontend/lib/sdk`
- large backend routers and services have been refactored into folder-as-module packages
- FastAPI application assembly has moved into `/Users/ln1/Projects/Spectra/backend/app_setup/`
- `services/` now follows clearer partitions such as `application`, `generation`, `media`, and `platform`
- the architecture guard is active at `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`

## Quick Entry Points

- docs home: `/Users/ln1/Projects/Spectra/docs/README.md`
- canonical project philosophy: `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
- engineering standards: `/Users/ln1/Projects/Spectra/docs/standards/README.md`
- repository agent contract: `/Users/ln1/Projects/Spectra/AGENTS.md`
- backend agent contract: `/Users/ln1/Projects/Spectra/backend/AGENTS.md`
- frontend agent contract: `/Users/ln1/Projects/Spectra/frontend/AGENTS.md`
- battle plan for remaining work: `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
- service topology notes: `/Users/ln1/Projects/Spectra/docs/service-topology-todo.md`
- changelog: `/Users/ln1/Projects/Spectra/CHANGELOG.md`

## Recommended Structural Reading

### Frontend

- `/Users/ln1/Projects/Spectra/frontend/app/`: page entrypoints
- `/Users/ln1/Projects/Spectra/frontend/components/`: UI components
- `/Users/ln1/Projects/Spectra/frontend/lib/sdk/`: unified API SDK
- `/Users/ln1/Projects/Spectra/frontend/stores/`: state management

### Backend

- `/Users/ln1/Projects/Spectra/backend/routers/`: HTTP entry layer
- `/Users/ln1/Projects/Spectra/backend/services/`: business and infrastructure capabilities
- `/Users/ln1/Projects/Spectra/backend/app_setup/`: FastAPI application assembly
- `/Users/ln1/Projects/Spectra/backend/schemas/`: request/response models
- `/Users/ln1/Projects/Spectra/backend/tests/`: backend tests

## Local Development

### Docker

```bash
docker-compose up --build
```

For more detail, see `/Users/ln1/Projects/Spectra/docs/guides/docker-setup.md`.
Runtime configuration should come from `/Users/ln1/Projects/Spectra/backend/.env`, using `/Users/ln1/Projects/Spectra/backend/.env.example` as the template.

### Backend

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
prisma generate
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Read These First

1. `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
2. `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
3. `/Users/ln1/Projects/Spectra/docs/standards/frontend.md`
4. `/Users/ln1/Projects/Spectra/AGENTS.md`
5. `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`
6. `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
