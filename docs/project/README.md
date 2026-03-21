# Project Design Workspace

> Updated: 2026-03-21
> Status: active

This directory is now a controlled design surface, not a dumping ground for every historical project-space draft.

## 1. Canonical Documents

These are the only documents here that should be read by default:

- [SYSTEM_PHILOSOPHY_2026-03-19.md](./SYSTEM_PHILOSOPHY_2026-03-19.md)
  - The highest-level ontology and worldview.
- [requirements.md](./requirements.md)
  - Original product and competition requirements.
- [卡片功能.md](./卡片功能.md)
  - Current product-facing card semantics and interaction intent.
- [ABCD_ROLE_MODEL.md](./ABCD_ROLE_MODEL.md)
  - Current team collaboration model and default ownership map.
- [D_TECH_DEEP_DIVE_MAP.md](./D_TECH_DEEP_DIVE_MAP.md)
  - Current technical deep-dive map for the specialized backend role.
- [D_EXECUTION_BACKLOG.md](./D_EXECUTION_BACKLOG.md)
  - Concrete, code-anchored task backlog for the specialized backend role.
- [tech-stack.md](./tech-stack.md)
  - Compatibility redirect to the live tech-stack document.

## 2. What Moved Out

The following project-space and route-strategy drafts are no longer part of the active surface:

- project-space model drafts
- project-space API drafts
- project-space evolution notes
- model-router strategy draft
- old D-contract draft

They now live in:

- [../archived/project-space/](../archived/project-space/)
- [../archived/specs/](../archived/specs/)

Read them only when historical context is necessary.

## 3. Reading Order

If you want to understand the project correctly and quickly:

1. `SYSTEM_PHILOSOPHY_2026-03-19.md`
2. `requirements.md`
3. `卡片功能.md`
4. `ABCD_ROLE_MODEL.md`
5. `D_TECH_DEEP_DIVE_MAP.md`
6. `D_EXECUTION_BACKLOG.md`
7. `../architecture/README.md`
8. `../standards/README.md`

## 4. Interpretation Rules

- Philosophy beats local draft.
- Current tested code beats historical plan.
- Active docs beat archived docs.
- If product behavior and implementation differ, compare:
  - `卡片功能.md`
  - live backend/OpenAPI contract
  - current tests

## 5. Scope of This Directory

This directory is for:

- canonical project philosophy
- product intent that still guides implementation
- team collaboration defaults that affect execution quality
- stable technical deep-dive maps tied to current code
- concrete execution backlogs for specialized roles
- a small set of stable design anchors

It is not for:

- old execution plans
- implementation checklists
- superseded project-space rollout drafts
- historical team handoff notes
