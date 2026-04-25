---
name: "personal-doc-engine"
description: "Use when building reusable Chinese long-document outputs such as competition plans, lab reports, course projects, or thesis-lite documents where Markdown sources must be assembled into polished DOCX/PDF with profile-driven templates and optional AI task briefs."
---

# Personal Doc Engine

Use this skill when the user wants to package or evolve a reusable document workflow rather than hand-edit a single Word file.

## What this skill assumes

- The engine lives under `doc-engine/`
- `pandoc` is the primary structure-to-docx converter
- `python-docx` is the last-mile formatter
- AI should generate or rewrite content, not control Word layout

## Workflow

1. Choose a profile from `doc-engine/profiles/`
2. Prepare source markdown, `meta.yaml`, and optional `ai_tasks.yaml`
3. Run `build-doc`
4. Review generated `.docx`
5. If the user wants project-specific wrapping, keep that wrapper thin and let the engine stay generic

## When to read more

- Read `doc-engine/README.md` when you need the architecture and design intent.
- Read `doc-engine/profiles/*.yaml` when choosing a profile.
- Read `doc-engine/src/doc_engine/word_pipeline.py` when debugging final DOCX layout.
- Read `doc-engine/src/doc_engine/ai.py` when expanding the AI task contract.

## Do not do this

- Do not hardcode project facts into the engine.
- Do not let AI decide page margins, heading numbering, or table border rules.
- Do not fork whole templates for every school unless layer composition fails first.
