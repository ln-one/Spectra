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
  - text retrieval should use `text-embedding-v3`
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

### 2.7 Office and media rendering must fail explicitly

- Status: `confirmed`
- Meaning: placeholder PPTX/DOCX/MP4 output is no longer an accepted recovery path; render failures should surface as explicit failures.
- Why it matters: fake artifacts hide render-toolchain failures and make success semantics misleading.

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

### 2.16 Upstream failures should use one shared vocabulary

- Status: `confirmed`
- Meaning: `AI completion`, `embedding`, and `RAG` degradation should classify upstream failures with the same core vocabulary: `auth_error`, `config_error`, `timeout`, `provider_unavailable`, `completion_error`.
- Why it matters: if each pipeline invents its own names, observability fragments and incident triage turns into message-string archaeology.

### 2.17 Project current version updates must validate real ownership

- Status: `confirmed`
- Meaning: `update_project_current_version()` must validate that the target version still exists and still belongs to the same project before updating `project.currentVersionId`.
- Why it matters: otherwise later code can bypass higher-level review checks and silently write a cross-project or dangling version anchor into the project's formal state.

### 2.18 Reference pinning must validate target-project ownership at the DB boundary

- Status: `confirmed`
- Meaning: low-level `create_project_reference()` and `update_project_reference()` must reject `mode=pinned` without `pinned_version_id`, and must validate that the pinned version still belongs to the target project.
- Why it matters: otherwise service-layer checks can be bypassed and the repository can persist cross-project reference anchors that only fail much later during retrieval or review flows.

### 2.19 Artifact creation must validate session and version anchors at write time

- Status: `confirmed`
- Meaning: low-level `create_artifact()` must reject `session_id` that does not belong to the same project and must reject `based_on_version_id` that does not belong to the same project.
- Why it matters: artifact lineage is formal system state; if the DB boundary accepts foreign session/version anchors, later preview, download, and review flows can look successful while the underlying project-space graph is already inconsistent.

### 2.20 Low-quality courseware fallback is worse than explicit failure

- Status: `confirmed`
- Meaning: courseware generation and render flows must not silently substitute user-visible junk output such as raw filenames, OCR residue, source dumps, or generic filler sentences just to keep the pipeline returning “success”.
- Why it matters: this creates semantic corruption that is harder to detect than an explicit failure, and it makes render/debug work look broken when the real problem is degraded upstream content.

### 2.21 Studio card content generation must fail explicitly

- Status: `confirmed`
- Meaning: `generation_session_service` studio card content generation must not fabricate artifact content or simulator turns from fallback templates when AI generation, JSON parsing, or schema validation fails. `STUDIO_TOOL_FALLBACK_MODE=allow` may relax logging posture, but it must not redefine failure into synthetic success.
- Why it matters: fake quiz/game/mindmap/animation/speaker-notes/simulator payloads make Studio look healthy while hiding the real provider or contract failure, which is worse for debugging than an explicit structured error.

### 2.22 Python Prisma runtime does not reliably support JS-style `select`

- Status: `confirmed`
- Meaning: Docker/backend runtime uses the Python Prisma client, and `find_unique()` / `find_many()` calls in hot paths must not assume JS-style `select=` support unless the generated client signature explicitly supports it.
- Why it matters: preview/runtime queries have already failed in Docker with `unexpected keyword argument 'select'`, which surfaced to users as generic `INVALID_INPUT` instead of the real query incompatibility.

### 2.23 The four external services are the only capability authorities

- Status: `confirmed`
- Meaning: Spectra runtime should treat `dualweave`, `stratumind`, `pagevra`, and `ourograph` as the only formal capability authorities for upload/parse, retrieval, render/preview/export, and formal project-space state.
- Why it matters: once backend keeps alternate local paths, duplicate env names, or second render/state semantics alive, product behavior drifts and debugging turns into tracing which compatibility layer actually answered the request.

## 3. Watch List

### 3.1 Large-file warnings are shrinking but not eliminated

- Status: `watch`
- Meaning: `architecture_guard` warnings have been reduced, but several older large files still remain in the refactor queue.
- Action: when touching warned files, prefer helper extraction or folder-as-module rather than adding more orchestration in place.

### 3.2 Provider-specific latency can masquerade as system slowness

- Status: `watch`
- Meaning: some slow requests are provider latency or remote embedding/provider failure, not local database or render-toolchain regressions.
- Action: inspect structured stage timings before changing architecture.
