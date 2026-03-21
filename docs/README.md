# Spectra Documentation

> Updated: 2026-03-21
> Status: active

This directory is the controlled documentation surface for Spectra.

Do not treat every Markdown file in the repository as equally authoritative.
Start here, then move outward only when needed.

## 1. Canonical Entry Points

Read these first:

1. [Project Philosophy](./project/SYSTEM_PHILOSOPHY_2026-03-19.md)
2. [Repository README](../README.md)
3. [Repository Agent Guide](../AGENTS.md)
4. [Architecture Index](./architecture/README.md)
5. [Standards Index](./standards/README.md)
6. [OpenAPI Index](./openapi/README.md)

## 2. Active Documentation Surface

These directories describe the current system and should stay aligned with code:

- [architecture/](./architecture/README.md): current architecture, deployment, runtime contracts
- [standards/](./standards/README.md): stable engineering rules
- [guides/](./guides/README.md): onboarding, local development, testing, CI/CD
- [openapi/](./openapi/README.md): current API contract sources
- [project/](./project/README.md): canonical philosophy and limited product-design memory
- [competition/](./competition/README.md): competition submission materials

## 3. Runtime and Delivery Docs

Use these when operating or deploying the system:

- [Deployment Environment Contract](./deployment-env-contract.md)
- [Deployment Topology](./deployment-topology.md)
- [Main Deployment Runbook](./runbook-main-deploy.md)
- [Incident Response Runbook](./runbook-incident-response.md)

## 4. Historical and Reference-Only Docs

Historical plans, obsolete drafts, superseded specs, and one-off execution records live under:

- [archived/](./archived/)

Use archived docs only for context. They are not the default truth for implementation decisions.

## 5. Interpretation Rules

- If code and docs disagree, prefer current tested code plus canonical docs.
- If two docs disagree, prefer the more canonical one:
  - philosophy and standards before design drafts
  - active docs before archived docs
  - current runtime/deployment docs before old plans
- If a document only exists to preserve history or redirect old links, mark it `reference-only` or archive it.

## 6. Tool-Local Docs

The repository also contains tool-local markdown outside `docs/`, such as:

- `.ai/`
- `.kiro/`

Treat them as workflow/tooling context, not product or architecture truth, unless a task explicitly targets those tools.
## 7. What Is No Longer Active

These categories have been removed from the active default reading path:

- old execution plans and optimization packets
- project-space design drafts from 2026-03-09 / 2026-03-12
- legacy OpenAPI guide duplicates
- typo/compatibility entry docs such as `docs/standard/README.md`

They remain preserved under `docs/archived/` when historical context still matters.
