# Legacy Interface Retirement Plan

## Purpose

This document turns the current compatibility surface into an explicit retirement plan.
The goal is not to delete bridge layers immediately; the goal is to remove them in a safe
order after freeze-period refactor work has stabilized.

## Current Legacy Surface

### Services compatibility package

File:
- `/Users/ln1/Projects/Spectra/backend/services/__init__.py`

Current consumers:
- Production code: none
- Tests/scripts still using `from services import ...`:
  - `/Users/ln1/Projects/Spectra/backend/tests/api/test_projects_api.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/api/test_observability.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/api/test_files_api.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/api/test_rag_api.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/api/test_contract_regression.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/api/test_chat_api.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/services/test_rag_indexing_service.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/test_model_router.py`

Assessment:
- Keep for now.
- No longer needed for production runtime wiring.
- Safe next step is shrinking tests and scripts off it, not deleting it immediately.

### Routers compatibility package

File:
- `/Users/ln1/Projects/Spectra/backend/routers/__init__.py`

Current consumers:
- Production code: none after `/Users/ln1/Projects/Spectra/backend/app_setup/routes.py` switched to explicit imports
- In-repo tests/scripts: none

Assessment:
- No longer needed by repository code paths.
- Candidate for the next cleanup PR once we confirm no external tooling depends on `from routers import ...` imports.

### Generation-session helper bridge

File:
- `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/helpers.py`

Role:
- Thin compatibility export for helper functions that have already been split into:
  - `outline_helpers.py`
  - `capability_helpers.py`
  - `serialization_helpers.py`

Assessment:
- Keep until no internal or test imports depend on the old helper module shape.
- Good candidate for retirement in the first cleanup wave.

### Deprecated OpenAPI contract surface

Files:
- `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-core.yaml`
- `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-edit.yaml`
- `/Users/ln1/Projects/Spectra/docs/openapi/schemas/generate-legacy.yaml`

Assessment:
- Keep during current freeze period to avoid silent contract breakage.
- Remove only after frontend and regression tests no longer rely on the legacy endpoints or payloads.

## Recommended Retirement Order

### Wave 1: test and script import cleanup

Do first:
- Replace remaining `from services import ...` in tests with explicit imports.
- Replace remaining `from routers import ...` in tests with explicit router-module imports.
- Replace any direct imports of `generation_session_service.helpers` with targeted helper-module imports.

Success condition:
- Compatibility packages are no longer required by active tests.

### Wave 2: bridge module slimming

Do next:
- Remove unused exports from `/Users/ln1/Projects/Spectra/backend/services/__init__.py`.
- Remove `/Users/ln1/Projects/Spectra/backend/routers/__init__.py` once test imports are migrated.
- Remove `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/helpers.py` once all imports are direct.

Success condition:
- Only intentional, documented compatibility aliases remain.

### Wave 3: legacy API contract retirement

Do after freeze-period verification:
- Audit frontend calls and regression tests against legacy generate-session paths.
- Remove deprecated OpenAPI path/schema files.
- Regenerate and revalidate source/target contract bundles.

Success condition:
- No runtime path, SDK consumer, or regression suite depends on legacy generate-session contract files.

## Guardrails

- Do not remove compatibility exports and contract surfaces in the same PR as functional behavior changes.
- Prefer one bridge family per PR: services, routers, helper bridge, or OpenAPI legacy surface.
- Every retirement PR should run:
  - `python3 /Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`
  - backend main test suite
  - OpenAPI source/target bundle + lint + alignment checks

## Not A Priority Right Now

These root modules are still legitimate primitives and should not be removed just to reduce file count:
- `/Users/ln1/Projects/Spectra/backend/services/auth_service.py`
- `/Users/ln1/Projects/Spectra/backend/services/capability_health.py`
- `/Users/ln1/Projects/Spectra/backend/services/chunking.py`
- `/Users/ln1/Projects/Spectra/backend/services/file.py`

They can be revisited later if domain grouping becomes clearer, but they are not current blockers.
