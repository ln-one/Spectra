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

### 2.7 Office placeholder artifacts must stay explicit

- Status: `confirmed`
- Meaning: placeholder PPTX/DOCX output is a development-only degradation path and should not be the default production behavior.
- Why it matters: fake Office files hide render-toolchain failures and make success semantics misleading.

### 2.8 Project owner is implicit, not a managed member concept

- Status: `confirmed`
- Meaning: the project owner is derived from `project.userId`; member-management APIs should not create duplicate owner memberships or allow owner membership semantics to be mutated into disabled/non-owner states.
- Why it matters: mixing implicit ownership with editable managed-member records creates permission ambiguity and weakens project-space semantics.

### 2.9 Candidate-change acceptance must keep version anchors real

- Status: `confirmed`
- Meaning: accepting a `CandidateChange` is allowed only when its `baseVersionId` still resolves to a real version in the same project, and the accepted merge must create a new version that still belongs to that project before `currentVersionId` advances.
- Why it matters: comparing `baseVersionId` to `project.currentVersionId` is not enough on its own; without anchor revalidation, the version chain can look successful while drifting semantically.

### 2.10 Artifact replacement should target the current lineage anchor

- Status: `confirmed`
- Meaning: `artifact_mode=replace` should prefer the current artifact in the active lineage, and when a `based_on_version_id` is explicitly supplied it should prefer the current artifact anchored to that same version.
- Why it matters: replacing the first returned artifact is not stable enough; it can supersede an already superseded result and corrupt artifact lineage semantics.

### 2.11 Project current-version anchors must stay project-local

- Status: `confirmed`
- Meaning: whenever code treats `project.currentVersionId` as the current formal anchor, that version must still resolve to a real `ProjectVersion` belonging to the same project.
- Why it matters: a dangling or cross-project current-version pointer makes version lists, artifact lineage, and candidate-change review look valid while the underlying graph is already corrupted.

### 2.12 Provider retries should be explicit and bounded

- Status: `confirmed`
- Meaning: transient upstream completion failures may retry a small, env-driven number of times, but auth/config failures must fail fast and timeout retries should not silently extend latency.
- Why it matters: this keeps provider resilience visible and controlled instead of hiding slowness behind opaque retry loops.

### 2.13 Real-provider tests must self-identify their env dependency

- Status: `confirmed`
- Meaning: tests that require a live provider key or live upstream service should skip themselves when the required env is absent, instead of failing as if product behavior regressed.
- Why it matters: this keeps the default backend gate focused on repository regressions, while still preserving explicit connectivity checks for environments that opt in.

### 2.14 Artifact version anchors must validate the project current version

- Status: `confirmed`
- Meaning: when artifact creation implicitly inherits `project.currentVersionId`, that anchor must still resolve to a real version owned by the same project before the artifact is persisted.
- Why it matters: artifact lineage should not inherit a dangling or cross-project version pointer just because the caller omitted `based_on_version_id`.

### 2.15 Embedding degradation should log structured fallback semantics

- Status: `confirmed`
- Meaning: when remote embedding fails and the system degrades to local sentence-transformers, logs should record failure type, provider, model, and fallback target explicitly.
- Why it matters: otherwise RAG slowness looks opaque and downstream logs cannot distinguish provider config/auth failures from normal retrieval misses.

## 3. Watch List

### 3.1 Large-file warnings are shrinking but not eliminated

- Status: `watch`
- Meaning: `architecture_guard` warnings have been reduced, but several older large files still remain in the refactor queue.
- Action: when touching warned files, prefer helper extraction or folder-as-module rather than adding more orchestration in place.

### 3.2 Provider-specific latency can masquerade as system slowness

- Status: `watch`
- Meaning: some slow requests are provider latency or remote embedding/provider failure, not local database or render-toolchain regressions.
- Action: inspect structured stage timings before changing architecture.
