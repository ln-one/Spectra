# Optimization Work Packet

This document translates the project's technical-breakthrough ambitions into
bounded tasks that can be owned by an optimization-oriented backend member.

It should be read together with:

- `/Users/ln1/Projects/Spectra/docs/master-execution-plan.md`
- `/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md`

## Why This Exists

The project no longer needs open-ended backend exploration.
It needs optimization work that is:

- measurable
- demonstrable
- tightly coupled to the ontology of the system
- useful in competition defense
- useful in the real product

These tasks are intentionally framed as **technical breakthrough topics**, not
generic refactors.

## Task 1 — Local Refine Controllability

### Problem

The system already supports refine flows, but the next leap is to make local
modification more controllable:

- change the intended segment
- preserve the non-target region
- maintain structural consistency

### Why It Matters

This is the deepest technical embodiment of the product philosophy:

- outputs become inputs
- artifacts become editable structure
- refinement becomes controlled evolution, not regeneration

### Suggested Work

- define segment/anchor-aware refine evaluation cases
- compare whole-response rewrite vs local-context rewrite
- add preservation heuristics or prompt constraints
- measure how often non-target regions drift

### Metrics

- target-segment hit rate
- non-target preservation rate
- structure preservation rate
- average number of follow-up user corrections

### Deliverables

- reproducible benchmark set
- baseline implementation
- improved implementation
- before/after comparison table
- one figure suitable for slides/defense

## Task 2 — Source-Grounded Generation

### Problem

Generated outputs should be more strongly grounded in library material rather
than drifting away from source evidence.

### Why It Matters

This makes the system more credible than a generic generation tool.
It supports the claim that the library is not passive storage, but an active,
constraining substrate.

### Suggested Work

- improve source-aware prompt assembly
- improve source selection strategy for card/session contexts
- reduce unsupported claims in generated results
- evaluate citation quality under different retrieval strategies

### Metrics

- citation precision
- source coverage
- unsupported claim rate
- grounded output rate

### Deliverables

- source-grounded generation benchmark
- baseline vs optimized comparison
- evaluation summary for competition materials

## Task 3 — Retrieval And Reranking Optimization

### Problem

Current RAG quality is already useful, but retrieval can become more
card-aware, session-aware, and project-aware.

### Why It Matters

This is a visible technical improvement that directly affects answer quality,
refine quality, and card generation quality.

### Suggested Work

- compare retrieval strategies for different card types
- add reranking rules for session/card context
- bias retrieval using artifact/source/reference structure
- evaluate top-k quality and latency tradeoffs

### Metrics

- hit@k
- MRR
- relevance score proxy
- retrieval latency

### Deliverables

- benchmark suite
- reranking proposal
- measurable improvement summary

## Task 4 — Task Scheduling And Queue Stability Optimization

### Problem

The system already has worker/queue tooling, but generation stability can be
improved further through smarter scheduling and failure handling.

### Why It Matters

This improves real robustness and competition reliability.
It is also a clean place for engineering + optimization work to meet.

### Suggested Work

- identify the heaviest task types
- compare queue latency and retry outcomes
- reduce pathological timeout/retry loops
- improve worker health heuristics

### Metrics

- mean task latency
- timeout rate
- retry success rate
- queue recovery time

### Deliverables

- queue/task baseline report
- optimization patch set
- comparison numbers suitable for demo and defense

## Task 5 — Result Reuse And Cache Efficiency

### Problem

Many flows can potentially reuse prior results instead of recomputing from
scratch:

- outline
- preview
- artifact transforms
- refine context preparation

### Why It Matters

This reduces cost and improves responsiveness while reinforcing the idea that
the system builds on its own history.

### Suggested Work

- map high-repeat computations
- add bounded reuse/caching where safe
- measure response-time and cost reductions

### Metrics

- latency reduction
- repeated-computation reduction
- call/token reduction

### Deliverables

- reuse candidate map
- safe cache/reuse implementation
- measured before/after summary

## Suggested Priority

If only two tasks can be pursued first:

1. Local Refine Controllability
2. Source-Grounded Generation

If three can be pursued:

1. Local Refine Controllability
2. Source-Grounded Generation
3. Retrieval And Reranking Optimization

## Collaboration Boundary

The optimization owner should **not** redefine core ontology or invent new
product semantics.

They should work inside these boundaries:

- optimization packets
- measurable baselines
- bounded implementation scopes
- evidence-producing improvements

That keeps the work parallelizable and prevents semantic drift.
