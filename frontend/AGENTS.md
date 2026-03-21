# Frontend Agent Guide

Read the root [AGENTS.md](/Users/ln1/Projects/Spectra/AGENTS.md) first. This file adds frontend-local entrypoints and constraints.

## Core Entry Points

- `app/`: route entrypoints
- `components/project/features/`: feature UI
- `stores/project-store/`: project-scoped state and async actions
- `lib/sdk/`: HTTP SDK and generated contract bindings

## Frontend Rules

- Reuse `lib/sdk` and `stores/project-store/*` before inventing new fetch flows.
- Preview/export and artifact download are different contracts.
- Keep feature/store/sdk boundaries explicit.
- When backend contract changes, update store/sdk naming in the same change.

## Validation

```bash
cd frontend
npm test
npm run lint
```
