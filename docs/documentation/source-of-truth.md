# Documentation Source of Truth

> Status: `current`
> Purpose: quick map of which docs are safe to trust for current architecture and which are historical or compatibility material only.

## Canonical Now

Use these when writing or explaining the current system:

- [AGENTS.md](/Users/ln1/Projects/Spectra/AGENTS.md)
- [docs/documentation/doc-workbench.md](/Users/ln1/Projects/Spectra/docs/documentation/doc-workbench.md)
- [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)
- [docs/architecture/system/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/system/overview.md)
- [docs/architecture/system/kernel-note.md](/Users/ln1/Projects/Spectra/docs/architecture/system/kernel-note.md)
- [docs/architecture/backend/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md)
- [docs/architecture/api-contract.md](/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md)
- [backend/README.md](/Users/ln1/Projects/Spectra/backend/README.md)
- [docs/agent-memory.md](/Users/ln1/Projects/Spectra/docs/agent-memory.md)

Important rule:

- for competition writing or architecture claims, canonical docs are not enough
- when there is drift risk, verify against live code, focused tests, and current
  service docs before treating a statement as current truth
- for outward-facing quality/performance claims, latest formal benchmark/report
  files outrank older prose summaries and internal stage notes

## Use Carefully

These are still useful, but not the first source of runtime truth:

- `docs/project/*`
  - role: active design / product philosophy
- `docs/guides/*`
  - role: operational or onboarding guides
- `docs/remaining-work-battle-plan.md`
  - role: planning context, not canonical runtime truth
- `docs/competition/*`
  - role: active writing surface; must be kept aligned with current code reality,
    not inherited old prose

Additional caution:

- `docs/project/*` may contain useful philosophy, requirements, and design
  direction, but older quality numbers inside them must not be treated as
  current showcase evidence unless independently revalidated against the latest
  formal benchmark/report set

## Historical / Compatibility

These may contain valuable context, but they are not current runtime truth:

- `docs/archived/architecture/*`
- `docs/guides/rq-migration.md`
- `docs/postgres-migration-checklist.md`
- older migration / rollout / compatibility docs that still mention `GenerationTask` as a live model

## Important Exception

- `docs/archived/project-space/*`
  - status: `historical semantic reference`
  - use: formal ontology for `Project / Reference / Version / Artifact / CandidateChange / Member`
  - do not treat as current runtime implementation docs

## Current Convergence Backlog

Still worth tightening before large-scale formal documentation work:

- some migration docs still expose old `GenerationTask`-centric wording on their first screen
- some canonical docs still need repository-relative links instead of machine-local paths
- a few operational guides still need clearer `historical` / `compatibility` labels
- competition-draft chapters must continue using chapter-level truth-check before
  they are treated as reliable explanation surfaces
