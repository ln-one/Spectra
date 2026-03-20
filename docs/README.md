# Spectra Documentation

> Updated: 2026-03-19
> Goal: a clean entry point, a clear status model, and documentation that matches the code.

## 1. Core Entry Points

- [Project Philosophy (Canonical)](./project/SYSTEM_PHILOSOPHY_2026-03-19.md)
- [Architecture Index](./architecture/README.md)
- [Tech Stack](./architecture/tech-stack.md)
- [OpenAPI Docs](./openapi/README.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 2. Engineering and Delivery

- [Guides](./guides/README.md)
- [Standards](./standards/README.md)
- [Master Execution Plan](./master-execution-plan.md)
- [Remaining Work Battle Plan](./remaining-work-battle-plan.md)
- [Optimization Work Packet](./optimization-work-packet.md)
- [Studio Card Backend Protocol](./studio-card-backend-protocol.md)
- [PostgreSQL Migration Checklist](./postgres-migration-checklist.md)
- [Deployment Topology](./deployment-topology.md)
- [Deployment Environment Contract](./deployment-env-contract.md)
- [Main Deployment Runbook](./runbook-main-deploy.md)
- [Incident Response Runbook](./runbook-incident-response.md)

## 3. Operational Scripts

- `backend/scripts/compat_surface_audit.py` - compatibility surface audit
- `backend/scripts/deploy_preflight.py` - pre-deploy environment and network checks
- `backend/scripts/deploy_smoke_check.py` - post-deploy smoke checks
- `backend/scripts/deploy_release_record.py` - release record skeleton generator
- `backend/scripts/incident_record.py` - incident record skeleton generator
- `backend/scripts/postgres_readiness_audit.py` - PostgreSQL readiness audit
- `backend/scripts/docker_deploy_readiness_audit.py` - Docker/distributed deployment readiness audit
- `backend/scripts/worker_queue_diagnose.py` - worker/queue/stuck-job diagnosis

## 4. Product Design and Historical Planning

- [Project Design Workspace](./project/README.md)
- [Original Requirements](./project/requirements.md)
- [Competition Materials](./competition/)
- [Archived Documents](./archived/)

## 5. Status Labels

- `Canonical`: the highest-level source for a concept or worldview.
- `Implemented`: reflected in the codebase today.
- `In Progress`: active direction, but not fully complete.
- `Archived`: kept for context, not for current implementation decisions.
