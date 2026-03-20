# Project Design Workspace

> Updated: 2026-03-19
> Purpose: keep the design workspace orderly, readable, and aligned with the system's living ontology.

This directory is not a pile of notes. It is the design memory of Spectra.

Use it in three layers:

## 1. Canonical

These documents define the highest-level worldview and the live product direction.

- [`SYSTEM_PHILOSOPHY_2026-03-19.md`](./SYSTEM_PHILOSOPHY_2026-03-19.md)
  - The absolute philosophy of the project.
  - Read this first when deciding what the system should become.
- [`requirements.md`](./requirements.md)
  - The original competition and product requirements.
- [`卡片功能.md`](./卡片功能.md)
  - The current product-facing card capability design.

## 2. Active Design References

These documents still matter when we shape product behavior, ontology, contracts, and evolution.

- [`SPACE_MODEL_INDEX_2026-03-09.md`](./SPACE_MODEL_INDEX_2026-03-09.md)
- [`LIBRARY_MODEL_RULES_DRAFT_2026-03-09.md`](./LIBRARY_MODEL_RULES_DRAFT_2026-03-09.md)
- [`PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md`](./PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md)
- [`PROJECT_SPACE_API_DRAFT_2026-03-09.md`](./PROJECT_SPACE_API_DRAFT_2026-03-09.md)
- [`PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md`](./PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md)
- [`PROJECT_SPACE_DATA_MODEL_ADDENDUM_2026-03-12.md`](./PROJECT_SPACE_DATA_MODEL_ADDENDUM_2026-03-12.md)
- [`D_CONTRACT_V1.md`](./D_CONTRACT_V1.md)
- [`D8_MODEL_ROUTER_STRATEGY_V1.md`](./D8_MODEL_ROUTER_STRATEGY_V1.md)
- [`tech-stack.md`](./tech-stack.md)

## 3. Historical Notes

The older alignment notes, early-stage research packages, and team handoff material have been moved out of the active design surface.

- [`../archived/project/README.md`](../archived/project/README.md)

Use them only when you need historical context or want to understand how the current ontology emerged.

## 4. Reading Order

If you want to understand the project quickly and correctly:

1. `SYSTEM_PHILOSOPHY_2026-03-19.md`
2. `requirements.md`
3. `卡片功能.md`
4. `SPACE_MODEL_INDEX_2026-03-09.md`
5. `PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md`
6. `PROJECT_SPACE_API_DRAFT_2026-03-09.md`
7. `D_CONTRACT_V1.md`

## 5. Rules of Interpretation

- If philosophy and implementation tension appear, begin from `SYSTEM_PHILOSOPHY_2026-03-19.md`.
- If product and interface tension appear, compare `卡片功能.md`, `D_CONTRACT_V1.md`, and the live backend protocol.
- If a document describes an old team split or interim rollout plan, treat it as historical context rather than current truth.
- The current execution roadmap lives outside this folder in `/Users/ln1/Projects/Spectra/docs/remaining-work-battle-plan.md`.
