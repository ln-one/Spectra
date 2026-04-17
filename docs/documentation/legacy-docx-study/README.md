# Legacy DOCX Study Pack

> Status: legacy
> Use: internal study only
> Source of truth: no

This directory contains a Markdown study pack derived from `/Users/ln1/Projects/Spectra/docs_output/Spectra.docx`.

## Why this exists

The old DOCX still carries useful **structure signals** for what many readers expect from a detailed design proposal:

- explicit architecture chaptering
- visible deployment and runtime sections
- database / semantics / state-machine expectations
- implementation-chain expectations
- testing, risk, and commercialization completeness signals

Those signals are worth studying. The old prose itself is not safe to reuse as current truth.

## What this pack may be used for

This pack is allowed to act as:

- a `格式参考`
  - chapter rhythm
  - title granularity
  - the traditional “detailed design proposal” surface feeling
- a `语气参考`
  - more formal, more stable, more submission-like explanation tone
  - reviewer-familiar specification voice
- a `完整度参考`
  - which completeness signals make a reader feel the document is mature and whole

Default rule:

- borrow shell, not soul
- borrow format, not facts
- borrow completeness, not legacy conclusions
- borrow tone, not outdated system content

## What this pack may not be used for

This pack must not be used as a source for:

- current architecture facts
- current microservice boundaries
- current deployment reality
- current database, state, or contract truth
- current benchmark, testing, or business conclusions

## Files

- `00-full-converted.md`: cleaned full Markdown conversion of the legacy DOCX
- `01-*` to `10-*`: chapter-level slices based on top-level chapters
- `99-crosswalk.md`: mapping from old DOCX structure to current `docs/competition/*`

## How to use this pack

Use it to answer questions such as:

- what “complete proposal” signals did the old document provide?
- which chapter habits are still useful for reader expectations?
- which ideas are obsolete and must not return?
- where does the current manuscript already cover the same expectations in a better way?

If old material seems useful, route through `99-crosswalk.md` first and only extract:

- title habits
- chapter organization
- completeness signals
- more formal sentence rhythm

## Hard rules

- do not cite this pack as current implementation truth
- do not copy old prose directly into `docs/competition/*`
- only borrow structure, completeness signals, and reader-expectation patterns
- truth-check any reusable idea against live code, tests, and current canonical docs first
- if a legacy passage improves “formal proposal feel” but weakens current system truth, discard it
