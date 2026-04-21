> Status: current
> Scope: word_document direct edit latency analysis
> Date: 2026-04-21

# Word Direct Edit Latency Analysis

## Conclusion

`word_document` 的 `direct_edit` 慢，不是因为它走了 chat refine / RAG / AI rewrite。

实际主链路是：

1. 规范化正文载荷
2. 重新渲染真实 `docx`
3. 更新 Ourograph artifact metadata / version binding
4. 触发 artifact silent accretion
5. 前端刷新 artifact history / preview

其中最不该阻塞“保存按钮结束 loading”的是第 4 步。

## Root Cause

在 `/Users/ln1/Projects/Spectra/backend/services/project_space_service/artifacts.py` 中，
`create_artifact_with_file(...)` 与 `update_artifact_with_file(...)` 都会在请求主链路里同步等待：

- `silently_accrete_artifact(...)`
- 并且通过 `ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS` 最长等待 8 秒

这会让 direct edit 即使已经完成真实文件重建与 metadata 更新，仍然继续卡在保存请求里。

## Fix Applied

2026-04-21 已做两项收口：

1. 将 `silent accretion` 改为后台异步任务，不再阻塞保存请求返回
2. 为以下阶段补充耗时日志：
   - `artifact_render_completed`
   - `artifact_create_completed`
   - `artifact_update_completed`
   - `artifact_silent_accretion_completed`

## Expected Effect

- `direct_edit` 的保存按钮应更快结束 `saving`
- `docx` 真实文件仍然会被重新生成
- 索引/沉积仍会继续做，但不再卡住用户

## Remaining Truth

`direct_edit` 仍不可能等同于纯前端本地保存，因为它依然需要：

- 生成真实 `docx`
- 更新正式 artifact metadata

因此它会比“改 textarea 本地 state”慢，但不该再被 silent accretion 额外拖住数秒。
