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
- In-repo tests/scripts still using `from services import ...`: none
- In-repo tests still using `import services.<module>` for direct module patching:
  - `/Users/ln1/Projects/Spectra/backend/tests/ai/test_dashscope_connectivity.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/services/test_file_parser.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/services/test_capability_health.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/services/test_auth_service.py`
  - `/Users/ln1/Projects/Spectra/backend/tests/test_model_router.py`

Assessment:
- Keep for now.
- No longer needed for production runtime wiring.
- The next safe step is shrinking direct test patching off package imports before deleting the bridge.

### Routers compatibility package

File:
- `/Users/ln1/Projects/Spectra/backend/routers/__init__.py`

Current consumers:
- Production code: none after `/Users/ln1/Projects/Spectra/backend/app_setup/routes.py` switched to explicit imports
- In-repo tests/scripts: none

Assessment:
- Legacy lazy exports have already been retired.
- What remains is only a minimal namespace package for `import routers.<module>` style imports.
- Candidate for full removal after test patching and any external tooling stop importing router submodules via the package namespace.

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

## Audit Tool

Run `python3 /Users/ln1/Projects/Spectra/backend/scripts/compat_surface_audit.py` before each compatibility-retirement PR to capture the remaining bridge usage surface.

As of the current freeze baseline, the most meaningful remaining internal bridge is `services.generation_session_service.helpers`, which is still imported by several generation-session modules.

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
