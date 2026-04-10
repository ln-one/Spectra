# Stratumind

Stratumind is Spectra's retrieval and citation engine.

It owns:

- text chunk indexing
- text retrieval
- optional post-retrieval reranking
- source detail lookup
- retrieval-facing citation payloads
- index lifecycle by `project_id` and `upload_id`

It does not own:

- `Project / Session / Artifact / Reference` truth
- auth or permission decisions
- file parsing
- chat or generation orchestration
- page-image retrieval in v1
- web/audio/video enrichment in v1

## Runtime

- language: Go
- vector store: Qdrant
- embedding: remote provider only
- rerank: optional via Dualweave text rerank capability
- health endpoint: `GET /health/ready`

## API

- `POST /indexes/chunks`
- `POST /search/text`
- `GET /sources/{chunk_id}?project_id=...`
- `DELETE /indexes/projects/{project_id}`
- `DELETE /indexes/projects/{project_id}/uploads/{upload_id}`
- `GET /health/ready`

## Optional Rerank

When `STRATUMIND_RERANK_ENABLED=true`, Stratumind will:

1. retrieve a wider candidate set from Qdrant
2. call `Dualweave` at `STRATUMIND_RERANK_BASE_URL`
3. return reranked results with `base_score`, `rerank_score`, and `ranking_stage`

Required configuration:

- `STRATUMIND_RERANK_ENABLED=true`
- `STRATUMIND_RERANK_BASE_URL=http://dualweave:8080`
- `STRATUMIND_RERANK_CANDIDATE_K=20`
