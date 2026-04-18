# 技术栈事实包（Code-Verified）

> Status: `current`
> Verification: `code-verified`
> Role: internal truth-check pack for architecture and commercial writing.
>
> This file is **not** the outward-facing proposal text. It exists to keep
> `docs/competition/*` aligned with current code, manifests, compose topology,
> and service build/runtime reality.

## 1. Use Rules

- Use this file as an internal fact pack, not as ready-made external prose.
- Prefer current code manifests and build files over historical stack summaries.
- When this file and outward-facing prose disagree, update the prose or this file
  from code reality; do not preserve stale wording for convenience.

## 2. Platform Baseline

### 2.1 Frontend Workbench

| Area | Current stack | Code-verified source |
| --- | --- | --- |
| Framework | Next.js 16.1.7 + React 18 + TypeScript | `frontend/package.json` |
| UI primitives | Radix UI + Tailwind CSS | `frontend/package.json` |
| State | Zustand | `frontend/package.json` |
| Forms / validation | React Hook Form + Zod | `frontend/package.json` |
| Motion / charts | Framer Motion + Recharts | `frontend/package.json` |

### 2.2 Spectra Backend Control Plane

| Area | Current stack | Code-verified source |
| --- | --- | --- |
| Service framework | FastAPI 0.129.0 + Uvicorn 0.32.1 | `backend/requirements.txt` |
| Schema / settings | Pydantic 2.12.5 + pydantic-settings 2.13.1 | `backend/requirements.txt` |
| Database access | Prisma Client Python 0.15.0 | `backend/requirements.txt` |
| Queue runtime | RQ 2.1.0 + Redis client 5.2.1 | `backend/requirements.txt` |
| AI routing | LiteLLM 1.81.13 + DashScope SDK | `backend/requirements.txt` |
| Parsing / media support | pypdf, python-docx, python-pptx, Faster-Whisper, OpenCV | `backend/requirements.txt` |

### 2.3 Data And Runtime Base

| Layer | Current stack | Code-verified source |
| --- | --- | --- |
| Relational database | PostgreSQL 16-alpine | `docker-compose.yml` |
| Cache / queue broker | Redis 7-alpine | `docker-compose.yml` |
| Vector store | Qdrant 1.13.2 | `docker-compose.yml` |
| Container orchestration | Docker Compose | `docker-compose.yml` |
| Runtime topology | frontend + backend + worker + data base + six formal authorities | `docker-compose.yml` |

## 3. Formal Authority Service Stacks

### 3.1 Diego

| Item | Current reality |
| --- | --- |
| Role | AI courseware / PPT generation authority |
| Main runtime | Python |
| Service framework | FastAPI |
| Supporting runtime | Node present for `pptxgenjs` capability |
| Package sources | `diego/pyproject.toml`, `diego/package.json`, `diego/Dockerfile` |
| Engineering character | outline / generation / QA / artifact-chain oriented generation service |

### 3.2 Pagevra

| Item | Current reality |
| --- | --- |
| Role | preview / render / export authority |
| Main runtime | Node + TypeScript |
| Key libraries | Mermaid, Playwright |
| Package sources | `pagevra/package.json`, `pagevra/Dockerfile`, `pagevra/Dockerfile.dev` |
| Engineering character | compile-bundle execution, preview / pptx / docx output, render runtime |

### 3.3 Ourograph

| Item | Current reality |
| --- | --- |
| Role | formal knowledge-state authority |
| Main runtime | Kotlin / JVM 17 |
| Service framework | Ktor 3.1.2 |
| Persistence stack | jOOQ, Flyway, HikariCP, PostgreSQL |
| Build stack | Gradle Kotlin DSL |
| Package sources | `ourograph/build.gradle.kts`, `ourograph/Dockerfile` |
| Engineering character | formal state kernel with ontology-aligned modules, not a generic workflow app |

### 3.4 Dualweave

| Item | Current reality |
| --- | --- |
| Role | ingest / delivery / remote parse entry authority |
| Main runtime | Go 1.26 |
| Build stack | Go modules + Docker multi-stage build |
| Package sources | `dualweave/go.mod`, `dualweave/Dockerfile` |
| Engineering character | single-ingest upload delivery, staged error semantics, replay, telemetry, provider-agnostic orchestration |

### 3.5 Stratumind

| Item | Current reality |
| --- | --- |
| Role | retrieval / evidence authority |
| Main runtime | Go 1.23.0 |
| Retrieval store | Qdrant |
| Optional sidecar | Python late-interaction sidecar (`FastAPI + Uvicorn`) |
| Package sources | `stratumind/go.mod`, `stratumind/Dockerfile`, `stratumind/sidecars/late_interaction/requirements.txt` |
| Engineering character | retrieval core with rewrite, planning, hybrid retrieval, rerank, evidence packing, benchmark and telemetry |

### 3.6 Limora

| Item | Current reality |
| --- | --- |
| Role | identity / session / organization / membership authority |
| Main runtime | Node + TypeScript |
| Service framework | Fastify |
| Identity stack | Better Auth + Prisma + PostgreSQL |
| Package sources | `limora/package.json`, `limora/Dockerfile.dev` |
| Engineering character | service-first identity authority with reusable auth, membership, organization, and audit boundary |

## 4. Runtime Topology Reality

Current code-verified compose topology includes:

- frontend workbench
- backend control plane
- worker runtime
- PostgreSQL
- Redis
- Qdrant
- Diego
- Pagevra
- Ourograph
- Dualweave
- Stratumind
- Limora

This file intentionally records runtime reality, not developer convenience
details. For outward-facing documentation, translate this into system credibility
signals rather than startup instructions.

## 5. Writing Translation Rules

When promoting this fact pack into outward-facing proposal prose:

- emphasize heterogeneous authority layers, not dependency trivia
- emphasize containerized runtime collaboration, not local startup commands
- emphasize engineering depth, not “all self-written from scratch” mythology
- state clearly that the services are authored by the team, while also using
  mature frameworks and public methods where appropriate

Do not directly promote:

- raw version pin lists unless a version itself matters
- internal startup scripts or source-selection mechanisms
- command snippets
- environment-variable inventories
