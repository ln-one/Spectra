# Ourograph

Ourograph is Spectra's formal-state source of truth.

It owns:

- `Project`
- `Reference`
- `Version`
- `Artifact`
- `CandidateChange`
- `Member`

It does not own:

- `Session`
- AI generation workflow
- preview/runtime orchestration
- render execution
- queue/task execution

## Runtime model

- Spectra is a consumer of Ourograph, not an inline host of Ourograph ontology
- `backend/services/ourograph_client.py` is the only formal-state transport in Spectra
- `backend/services/project_space_service/service.py` is a thin consumer facade
- local Prisma `services/database/project_space_*` mixins are retired and should not be used for formal state
- Spectra may still orchestrate local artifact file generation, but formal artifact records are persisted through Ourograph
- Spectra no longer treats inline `ourograph_core` execution as a product runtime path

## Deployment rule

- `OUROGRAPH_BASE_URL` is required for project-space formal-state operations
- default Docker URL inside compose: `http://ourograph:8101`
- repository compose files build Ourograph from `ourograph/Dockerfile` so Spectra and Ourograph stay on the same commit
- Ourograph uses its own Postgres database (`ourograph`), created by Postgres init scripts during first cluster bootstrap
- Ourograph receives its database connection through `OUROGRAPH_DATABASE_URL`, not Spectra's `DATABASE_URL`
- local-source compose override must preserve the base `OUROGRAPH_DATABASE_URL`, Postgres bootstrap mount, and `GET /health/ready` probe
- readiness probe: `GET /health/ready`
- old exited `spectra-ourograph_db_init-1` containers may remain in Docker history, but current compose no longer creates that service

## Interaction model

- Spectra owns workflow shell, `Session`, generation, RAG, render integration, and downloads
- Ourograph owns formal library/project state
- `Pagevra` owns rendering
- `Dualweave` owns ingest/delivery workflow
