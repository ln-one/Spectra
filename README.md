# Spectra

Spectra is a multimodal AI teaching workspace for real instructional workflows: project materials, dialogue, generation sessions, preview-and-refine loops, and the project space all cooperate inside one system.

## Current State

The repository has completed its first major structural convergence:

- frontend APIs are unified in `frontend/lib/sdk`
- large backend routers and services have been refactored into folder-as-module packages
- FastAPI application assembly has moved into `backend/app_setup/`
- `services/` now follows clearer partitions such as `application`, `generation`, `media`, and `platform`
- the architecture guard is active at `backend/scripts/architecture_guard.py`

## Quick Entry Points

- docs home: `/Users/ln1/Projects/Spectra/docs/README.md`
- canonical project philosophy: `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
- engineering standards: `/Users/ln1/Projects/Spectra/docs/standards/README.md`
- repository agent contract: `/Users/ln1/Projects/Spectra/AGENTS.md`
- backend agent contract: `/Users/ln1/Projects/Spectra/backend/AGENTS.md`
- frontend agent contract: `/Users/ln1/Projects/Spectra/frontend/AGENTS.md`
- battle plan for remaining work: `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`
- archived plans and historical drafts: `/Users/ln1/Projects/Spectra/docs/archived/`
- changelog: `/Users/ln1/Projects/Spectra/CHANGELOG.md`

## Recommended Structural Reading

### Frontend

- `frontend/app/`: page entrypoints
- `frontend/components/`: UI components
- `frontend/lib/sdk/`: unified API SDK
- `frontend/stores/`: state management

### Backend

- `backend/routers/`: HTTP entry layer
- `backend/services/`: business and infrastructure capabilities
- `backend/app_setup/`: FastAPI application assembly
- `backend/schemas/`: request/response models
- `backend/tests/`: backend tests

## Local Development

### Docker

```bash
python3 ./scripts/compose_smart.py status
python3 ./scripts/compose_smart.py sync --channel develop
python3 ./scripts/compose_smart.py doctor
python3 ./scripts/compose_smart.py up --build
```

For more detail, see `docs/guides/docker-setup.md`.
Runtime configuration should come from `backend/.env`, using `backend/.env.example` as the template.

The four microservices are consumed in two modes:

- default/team mode: `docker-compose.yml` pulls the locked GHCR images for `Pagevra`, `Dualweave`, `Ourograph`, and `Stratumind`
- maintainer mode: initialize the matching submodule and let `python3 ./scripts/compose_smart.py` switch that service to a local source build automatically

```bash
git submodule update --init --recursive dualweave
python3 ./scripts/compose_smart.py up --build
```

When a service submodule is initialized, the smart compose entrypoint prefers
that local source tree over the locked image. Locked images remain the default
path for environments that do not have submodule access.

If Dualweave is used as an external upload orchestration service, configure the
backend with:

- `DUALWEAVE_ENABLED=true`
- `DUALWEAVE_BASE_URL=http://dualweave:8080`
- `DOCUMENT_PARSER=mineru_cloud` for full MinerU-through-Dualweave routing, or
  `DOCUMENT_PARSER=auto` to keep the existing auto-routing and only send PDFs
  through the Dualweave-backed MinerU path.

The current integration shape is intentionally service-first: Spectra calls
Dualweave over HTTP rather than embedding the Go runtime directly. Dualweave
returns a standard upload result plus `processing_artifact.result_url`; Spectra
still owns downloading that artifact and extracting markdown for indexing, so
the boundary stays at the artifact reference layer.

Pagevra, Dualweave, Ourograph, and Stratumind all follow the same pattern:
normal developers consume the locked image, while maintainers can initialize
submodules and keep using the same smart compose entrypoint for local builds.

`compose_smart.py` is the only entrypoint for service image orchestration.
The core commands are:

- `status`: show the current channel, local-source overrides, and the locked image refs
- `sync --channel develop|main`: pull the currently approved locked images and write `.env.compose.lock` plus a root `.env` mirror for plain `docker compose`
- `doctor`: validate Docker, lock-file completeness, and compose readiness
- `up --build`: start the stack with local-source overrides when present

`compose_smart.py status` will print the current mode for each private service:

- `Pagevra`: local source or docker image
- `Dualweave`: local source or docker image
- `Ourograph`: local source or docker image
- `Stratumind`: local source or docker image

Current default behavior:

- Spectra reads `infra/stack-lock.develop.json` on non-`main` branches and `infra/stack-lock.main.json` on `main`
- base compose consumes the lock-generated image refs, and plain `docker compose` works after `sync` because the same refs are mirrored into the root `.env`
- if a local `pagevra/`, `dualweave/`, `ourograph/`, or `stratumind/` source checkout exists, `compose_smart.py` adds the matching override file and uses local source mode for that service
- if a lock entry is still unpublished, `sync` and `doctor` fail explicitly instead of drifting to a floating tag

Recommended onboarding for developers without microservice repo access:

```bash
python3 ./scripts/compose_smart.py sync --channel develop
python3 ./scripts/compose_smart.py doctor
python3 ./scripts/compose_smart.py up -d
```

This path does not require initializing any submodule. The contract is that the
locked GHCR images must remain anonymously pullable. `sync` and `doctor` now
verify anonymous GHCR token + manifest access for every image-mode service and
fail explicitly if a package is still private.

The legacy shell wrapper `scripts/compose-smart.sh`
now forwards to the Python entrypoint for compatibility.

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

1. `docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`
2. `docs/standards/backend.md`
3. `docs/standards/frontend.md`
4. `AGENTS.md`
5. `backend/scripts/architecture_guard.py`
6. `docs/remaining-work-battle-plan.md`
