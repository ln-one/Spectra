# D-Contract v1（文档先行）

## 文档元信息
- 版本：v1.0-draft
- 日期：2026-03-05
- 负责人：成员 D（AI/RAG）
- 适用范围：解析、视频理解、语音识别三条能力链路的输入/输出/失败/降级语义
- 对齐对象：成员 A（契约守护）、成员 C（后端实现）、成员 B（前端展示）

## 目标
1. 统一三条能力链路的字段语义，避免“前端有入口、后端无语义字段”。
2. 固化成功/失败/降级最小契约，确保 B 可稳定展示状态与提示。
3. 为 C2/C3/C4 联调提供可执行字段清单与样例。

## 通用响应约定（跨能力）

### 最小通用字段
- `capability`：能力标识，枚举：`document_parser` / `video_understanding` / `speech_recognition`
- `provider`：目标能力或供应商（例如 `MinerU`、`Qwen-VL`、`Faster-Whisper`）
- `status`：`available` / `degraded` / `unavailable`
- `fallback_used`：是否发生降级
- `fallback_target`：降级目标（如 `local_parser`）
- `reason_code`：失败/降级原因码（如 `PROVIDER_TIMEOUT`）
- `user_message`：可直接展示给用户的提示语
- `trace_id`：链路追踪 ID（用于排错）

### 结果可溯源字段（跨能力输出）
- `chunk_id`
- `source_type`：`document` / `video` / `ai_generated`
- `filename`
- `page_number`（文档场景）
- `timestamp`（视频/语音场景）

## 能力契约明细

### 1) 文档解析（document_parser）

#### 输入字段
- `file_id`（必填）
- `project_id`（必填）
- `file_type`（必填，`pdf|word|ppt`）
- `parser_provider`（选填，`mineru|llamaparse|local`）

#### 输出字段（成功）
- `status=available`
- `provider`（实际执行 provider）
- `parse_result.text_length`
- `parse_result.pages_extracted`（若可用）
- `chunk_count` / `indexed_count`

#### 输出字段（失败/降级）
- `status=degraded|unavailable`
- `fallback_used` / `fallback_target`
- `reason_code`
- `user_message`

#### 当前实现差距（截至 2026-03-05）
- `MinerU/LlamaParse` provider 仍为 stub，真实解析能力待 C2 完成。
- 降级语义在生成会话契约中有定义，但解析链路接口尚未统一回传完整降级字段。

### 2) 视频理解（video_understanding）

#### 输入字段
- `file_id`（必填）
- `project_id`（必填）
- `segment_policy`（选填）
- `prompt_template_id`（选填）

#### 输出字段（成功）
- `status=available`
- `provider=Qwen-VL`（或实际 provider）
- `segments[]`：每段至少包含 `timestamp`, `content`, `confidence`
- `sources[]`：可映射到 `chunk_id/source_type/filename/timestamp`

#### 输出字段（失败/降级）
- `status=degraded|unavailable`
- `fallback_used` / `fallback_target`
- `reason_code`
- `user_message`

#### 当前实现差距（截至 2026-03-05）
- 视频执行链路尚未接入真实 Qwen-VL（依赖 C3）。
- 解析入口对视频仍为占位文案，尚无结构化 `segments`。

### 3) 语音识别（speech_recognition）

#### 输入字段
- `audio`（必填）
- `project_id`（必填）
- `language`（选填）
- `model_size`（选填）

#### 输出字段（成功）
- `status=available`
- `provider=Faster-Whisper`（或实际 provider）
- `text`
- `confidence`
- `duration`
- `message`（会话消息对象）

#### 输出字段（失败/降级）
- `status=degraded|unavailable`
- `fallback_used` / `fallback_target`
- `reason_code`
- `user_message`

#### 当前实现差距（截至 2026-03-05）
- `/api/v1/chat/voice` 目前返回占位识别文本，尚非真实 Whisper 结果（依赖 C3）。
- 缺少标准化错误码与降级字段返回。

## 原因码建议（v1）
- `PROVIDER_TIMEOUT`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `INVALID_INPUT_FORMAT`
- `UNSUPPORTED_FILE_TYPE`
- `EMPTY_OUTPUT`
- `INTERNAL_ERROR`

## 成功/失败/降级响应样例（最小）

### 成功
```json
{
  "capability": "speech_recognition",
  "provider": "Faster-Whisper",
  "status": "available",
  "fallback_used": false,
  "text": "牛顿第二定律描述了力与加速度的关系",
  "confidence": 0.91,
  "duration": 12.4,
  "trace_id": "trc_xxx"
}
```

### 降级
```json
{
  "capability": "document_parser",
  "provider": "MinerU",
  "status": "degraded",
  "fallback_used": true,
  "fallback_target": "local_parser",
  "reason_code": "PROVIDER_TIMEOUT",
  "user_message": "高级解析不可用，已自动切换到基础解析，结果可能有版面差异",
  "trace_id": "trc_xxx"
}
```

### 失败
```json
{
  "capability": "video_understanding",
  "provider": "Qwen-VL",
  "status": "unavailable",
  "fallback_used": false,
  "reason_code": "INVALID_INPUT_FORMAT",
  "user_message": "视频格式不受支持，请转为 mp4 后重试",
  "trace_id": "trc_xxx"
}
```

## 与 A/B/C 的对齐清单

### A（契约守护）
- 需要确认：上述通用字段是否纳入统一会话状态与 DoD 门禁。
- 输出物：契约评审结论（通过/需改动项）。

### C（后端实现）
- 需要落实：C2/C3/C4 将字段接入真实链路返回。
- 输出物：接口实现 PR + 成功/降级/失败真实样例。

### B（前端展示）
- 可直接使用：`status/fallback_used/fallback_target/reason_code/user_message`。
- 输出物：状态提示组件与来源展示策略对齐。

## 验收标准（v1）
1. 三能力都能返回统一的最小通用字段。
2. 任一失败/降级场景都有可展示 `user_message` 与可追踪 `trace_id`。
3. 前端不再依赖隐式判断识别状态。
4. D4/D5 的评测与基线可追溯到本契约字段。

## 下一步执行
1. 与 A/C 做一次字段级 walkthrough，确认增删项。
2. 让 C 提供三能力真实返回样例（成功/降级/失败各 1）。
3. D 基于该契约继续推进 D4（溯源评测）与 D5（降级基线）。
