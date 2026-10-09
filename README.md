# Spectra

Spectra is a multimodal knowledge-creation workbench for turning source material into teaching documents, presentations, quizzes, mind maps, interactive games, and animations.

## Experience

Try the live experience at [spectra.forevergreendam.cn](https://spectra.forevergreendam.cn).

## What it includes

- Workspace-scoped sources, citations, and knowledge search
- AI-assisted conversation and artifact generation
- Editable teaching documents with DOCX export
- Presentation, mind map, quiz, game, and animation workflows
- PostgreSQL, Redis, S3-compatible storage, and a durable DBOS worker

## Run locally

Requires Node.js 24, Docker, npm 11, and Pandoc 3.12.1 on `PATH` for DOCX export.
The public npm dependencies do not require a Tiptap Pro registry token.

On Linux, install the pinned converter with `bash scripts/install-pandoc.sh /usr/local`
(requires write access to that directory). On Windows, use the official
[Pandoc 3.12.1 release](https://github.com/jgm/pandoc/releases/tag/3.12.1) and add its
directory to `PATH`. CI and both Docker images install the checksum-verified Linux runtime.
Pandoc performs DOCX conversion locally; no external conversion API is used.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

The development command applies the database and auth migrations, initializes DBOS, and starts the application. Open [http://localhost:3000](http://localhost:3000).

## Common commands

```bash
npm run typecheck
npm test
npm run verify
npm run verify:browser
```

## Operations

- [DBOS worker recovery](docs/operations/dbos-worker-recovery-runbook.md)
- [OpenHands runtime deployment](docs/operations/openhands-runtime-deployment.md)

## License

This repository is source-available but not open source. See [LICENSE](LICENSE).
