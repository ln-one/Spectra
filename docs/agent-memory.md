# Agent Memory

> Purpose: capture confirmed, reusable repository knowledge that matters to AI agents,
> but is not yet broad enough to become a permanent standard.
>
> Status vocabulary:
> - `confirmed`: repeatedly observed and verified against code/runtime
> - `watch`: likely true, but still needs more validation
> - `retired`: no longer current; keep only if useful for historical debugging

## 1. How To Use This File

- Keep entries short and operational.
- Only record patterns that are likely to save future debugging time.
- If a note becomes stable repository policy, move or duplicate it into:
  - [AGENTS.md](/Users/ln1/Projects/Spectra/AGENTS.md), or
  - `docs/standards/*.md`
- If a note becomes obsolete, mark it `retired` rather than silently rewriting history.

## 2. Confirmed Patterns

### 2.1 Model/provider config must respect `.env`

- Status: `confirmed`
- Meaning: active model/provider selection must come from repository/runtime config, not code-local hardcoding.
- Why it matters: this repository has already hit real issues where `docker-compose.yml` overrode `.env` model choices and caused confusing runtime behavior.

### 2.2 Text and multimodal embedding must stay separated

- Status: `confirmed`
- Meaning:
  - text retrieval should use `text-embedding-v4`
  - multimodal embedding should use `qwen3-vl-embedding`
- Why it matters: using the wrong DashScope interface caused broken embedding calls and opaque performance degradation.

### 2.3 Queue execution is primary; local async is fallback only

- Status: `confirmed`
- Meaning: generation and outline tasks should prefer RQ worker execution. `local_async` is a degradation path, not a normal steady-state path.
- Why it matters: treating fallback as normal hides worker availability bugs and weakens observability.

### 2.4 Worker availability must use fresh workers only

- Status: `confirmed`
- Meaning: stale Redis worker registrations must not count as healthy workers.
- Why it matters: stale worker keys have already caused dispatch misjudgment and confusing fallback behavior.

### 2.5 Session output URLs should resolve through project artifact download

- Status: `confirmed`
- Meaning: final PPT/Word URLs should bind to project-space artifact downloads, not text preview/export endpoints.
- Why it matters: preview/export and final binary download are different contracts and must not be mixed.

### 2.6 Rendering path depends on Marp CLI and Pandoc

- Status: `confirmed`
- Meaning:
  - PPT generation depends on Marp CLI-based rendering
  - Word generation depends on Pandoc
- Why it matters: generation debugging must distinguish AI/content failure from render-toolchain failure.

## 3. Watch List

### 3.1 Large-file warnings are shrinking but not eliminated

- Status: `watch`
- Meaning: `architecture_guard` warnings have been reduced, but several older large files still remain in the refactor queue.
- Action: when touching warned files, prefer helper extraction or folder-as-module rather than adding more orchestration in place.

### 3.2 Provider-specific latency can masquerade as system slowness

- Status: `watch`
- Meaning: some slow requests are provider latency or remote embedding/provider failure, not local database or render-toolchain regressions.
- Action: inspect structured stage timings before changing architecture.
