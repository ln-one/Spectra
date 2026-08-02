# Spectra agent guide

Spectra is a multimodal knowledge-creation workbench: a Next.js TypeScript modular monolith backed
by PostgreSQL. Routes and entry points live in `src/app/`, product code in `src/features/`, database
code in `src/database/`, forward-only migrations in `drizzle/`, and product references in
`docs/design/`.

NeoSpectra is read-only reference material. Never modify it or copy its service architecture.

## Working rules

- State the goal, constraints, and observable completion condition before changing code.
- Make the smallest focused change; preserve unrelated work and surface consequential ambiguity.
- Use CodeGraph for structure and impact analysis, and `rg` for literal text.
- Use product language and one canonical name per concept.
- Put system UI copy in locale catalogs; never use user content as a translation key.
- Comments are English and only explain design reasons, security boundaries, or non-obvious behavior.

## Product and architecture

- Keep `src/app/` thin; behavior belongs to its owning feature.
- Preserve `Better Auth Session -> Principal -> Actor -> Policy`. Product modules receive `Actor`
  and do not read cookies or sessions.
- Modules in this process call feature functions directly, not internal HTTP APIs.
- Keep one runtime, database, and deployment unit until measured evidence requires otherwise.
- Add abstractions for demonstrated repetition or real external boundaries. Avoid generic dumping
  grounds, global business stores, base services, service locators, and speculative shells.
- Add a dependency only when it replaces meaningful owned code or operational responsibility.
- Pin runtime resources, use least privilege, and never mount Docker sockets or ignored host
  resources into application or agent processes.

## Code and tests

- Validate untrusted boundaries with Zod and persistent invariants with database constraints.
- Prefer explicit data flow, pure policies, discriminated unions, and exhaustive handling.
- Avoid unchecked `any`, broad assertions, non-null assertions, hidden fallbacks, and fake success.
- Test contracts and user-visible behavior. Put bug regressions at the lowest reliable layer.

## Verification

- During implementation: `npm run verify:changed`.
- Before normal handoff: `npm run verify`.
- For routing, auth, migrations, build, or browser behavior: `npm run verify:full`.
- Read the full output and inspect the diff before reporting completion. Keep commit/push hooks fast.

## Runtime diagnosis

- Logs are Pino JSON. Never log user content, prompts, bodies, headers, cookies, credentials, or full
  URLs. Diagnose with stable IDs, narrow time windows, and exact event names.
- Use `npm run observability:up` and `npm run observability:doctor` for the telemetry stack.
- Run `npm run dbos:doctor` before retrying or resetting stalled generation or cleanup work.
