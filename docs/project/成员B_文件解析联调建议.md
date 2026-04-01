# 成员B文件解析联调建议

## 1. 联调目标

前端侧目标不是“上传成功”，而是保证文档可进入可用态：

- 远端成功：回填 MinerU 结果并完成索引
- 远端失败：触发 fallback 并降级到 local
- 最终以 `status=ready` 作为可用于对话/生成的门槛

## 2. 当前后端契约（B 必读）

上传接口：

- `POST /api/v1/files`
- 支持 `defer_parse`（`multipart/form-data`，布尔）

回填/降级接口：

- `POST /api/v1/files/{file_id}/parse/mineru`
- `POST /api/v1/files/{file_id}/parse/fallback`

当 `defer_parse=true` 时，上传后文件可能处于：

- `status=uploading`
- `parse_result.deferred_parse=true`
- `parse_result.parse_mode="dual_channel"`
- `parse_result.state="awaiting_remote_result"`

## 3. 前端推荐编排

1. 上传文件时默认带 `defer_parse=true`（至少对 PDF）。
2. 上传成功后拿到 `file_id`。
3. 尝试远端解析成功路径：
   - 调 `POST /api/v1/files/{file_id}/parse/mineru`，最少传 `parsed_text`。
4. 远端失败或超时时走降级路径：
   - 调 `POST /api/v1/files/{file_id}/parse/fallback`。
5. 轮询 `GET /api/v1/projects/{project_id}/files`，直到 `ready/failed`。

## 4. 判定规则（前端避免误判）

- 不要把“上传成功”当作“可用于问答/生成”。
- 仅当 `status=ready` 才认为文件可用。
- 降级语义展示建议：
  - `provider=local` 且 `fallback_used=true` 时，显示“已降级到本地解析”。
- 远端成功语义展示建议：
  - `provider=mineru_remote`（或远端 provider）且 `fallback_used=false`。

## 5. UI 与容错建议

- 对 `parse_result`、`parse_details` 做空值容错，不依赖固定字段总是存在。
- 不要硬编码 `pages_extracted > 0` 作为成功条件。
- 优先展示 `parse_result.capability_status.user_message`（若存在）。
- 对同一 `file_id` 做防重入，避免重复触发 `parse/mineru` 或 `parse/fallback`。

## 6. 联调用例（B 自测）

成功路径：

1. 上传（`defer_parse=true`）
2. 回填 `parse/mineru`
3. 列表中该文件最终 `ready`，`provider` 为远端，`fallback_used=false`

失败路径：

1. 上传（`defer_parse=true`）
2. 触发 `parse/fallback`
3. 列表中该文件最终 `ready`，`provider=local`，`fallback_used=true`

## 7. 当前联调结论口径

前端实现完成标准应为：

- 能稳定串起“上传 -> 回填/降级 -> ready”的完整闭环
- 能正确展示远端成功与降级语义
- 不会因字段缺失或中间态导致 UI 卡死或误判
