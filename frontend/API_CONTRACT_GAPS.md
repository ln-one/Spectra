# Frontend Contract Gaps Log

This file tracks confirmed backend/runtime vs `openapi-target` gaps that are
already handled by frontend compatibility logic.

## 2026-03-30

1. `POST /api/v1/generate/sessions`
- Runtime response includes `data.run`.
- `openapi-target` model `CreateGenerationSessionResponseTarget` only declares
  `data.session`.
- Frontend handling:
  - `generateApi.createSession` keeps `data.run` as optional compatibility
    field when present.
  - Business code reads run info from the SDK response directly, without
    scattered type casts.
