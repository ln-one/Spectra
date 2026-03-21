# D-Contract v1（当前实现对齐版）

## 文档元信息
- 版本：v1.0
- 日期：2026-03-16
- 负责人：成员 D（AI/RAG）
- 对齐基线：
  - `docs/openapi-source.yaml`
  - `docs/openapi-target-source.yaml`
  - `backend/routers/chat.py`
  - `backend/routers/files.py`
  - `backend/services/file_parser.py`
  - `backend/services/video_service.py`
  - `backend/services/audio_service.py`
  - `backend/services/capability_health.py`

## 1. 目标与范围
本契约覆盖三条能力链路：
1. `document_parser`
2. `video_understanding`
3. `speech_recognition`

目标：
1. 固化跨能力统一字段，避免前端按字符串猜状态。
2. 固化成功/降级/失败的最小返回语义。
3. 输出缺失字段清单，供 A/C/B 联调闭环。

## 2. 统一字段（跨能力）

### 2.1 CapabilityStatus（统一状态对象）
- `capability`：`document_parser | video_understanding | speech_recognition`
- `provider`：实际执行 provider
- `status`：`available | degraded | unavailable`
- `fallback_used`：是否发生降级
- `fallback_target`：降级目标 provider（可空）
- `reason_code`：
  - `PROVIDER_TIMEOUT`
  - `PROVIDER_RATE_LIMITED`
  - `PROVIDER_UNAVAILABLE`
  - `INVALID_INPUT_FORMAT`
  - `UNSUPPORTED_FILE_TYPE`
  - `EMPTY_OUTPUT`
  - `INTERNAL_ERROR`
- `user_message`：可直出给用户的提示语（可空）
- `trace_id`：链路追踪 ID（可空）

### 2.2 SourceReference（统一引用对象）
- `chunk_id`
- `source_type`：`document | web | video | audio | ai_generated`
- `filename`
- `page_number`（文档场景）
- `timestamp`（音视频场景）
- `score`（检索/重排可选）
- `content_preview`（可选）

## 3. 三能力链路对照

### 3.1 文档解析（document_parser）
入口：
- `POST /api/v1/files`
- `POST /api/v1/files/batch`

当前已对齐字段：
1. 文件对象中存在 `parse_result.capability_status`（CapabilityStatus）。
2. 解析结果存在 `chunk_count/indexed_count`。
3. 文档解析链路支持主备切换与降级语义（`mineru/llamaparse/local`）。
4. 失败场景可回传 `reason_code/user_message/trace_id`。

当前缺口：
1. `/api/v1/files` 的根级响应未单独暴露标准化 `error.code/retryable`（以异常路径为主）。
2. parse 细粒度质量字段（如布局完整度）尚未进入统一契约。

### 3.2 视频理解（video_understanding）
入口：
- `POST /api/v1/files`（`file_type=video`）

当前已对齐字段：
1. `parse_result.segments[]` 提供结构化片段（`timestamp/content/confidence`）。
2. `parse_result.sources[]` 映射为 `SourceReference`。
3. `parse_result.capability_status` 提供降级语义。

当前缺口：
1. 还没有独立的视频处理 API；当前绑定在上传解析链路。
2. Qwen-VL 失败后的降级语义已统一，但质量门禁仍依赖后续评测脚本。

### 3.3 语音识别（speech_recognition）
入口：
- `POST /api/v1/chat/voice`

当前已对齐字段：
1. 返回 `text/confidence/duration`。
2. 返回 `capability_status`（CapabilityStatus）。
3. 支持 `session_id` 作用域，满足 `project_id + session_id` 隔离语义。
4. 返回 `observability`，与 `/chat/messages` 的观测语义保持一致。

当前缺口：
1. `/chat/voice` 的 assistant 回复仍为保底话术，尚未进入完整生成链路。

## 4. 成功/降级/失败样例（最小可执行）

### 4.1 成功（speech_recognition）
```json
{
  "success": true,
  "data": {
    "session_id": "sess_xxx",
    "text": "牛顿第二定律描述了力与加速度关系",
    "confidence": 0.91,
    "duration": 12.4,
    "capability_status": {
      "capability": "speech_recognition",
      "provider": "Faster-Whisper",
      "status": "available",
      "fallback_used": false
    }
  },
  "message": "语音识别成功"
}
```

### 4.2 降级（document_parser）
```json
{
  "success": true,
  "data": {
    "file": {
      "parse_result": {
        "chunk_count": 12,
        "indexed_count": 12,
        "capability_status": {
          "capability": "document_parser",
          "provider": "local",
          "status": "degraded",
          "fallback_used": true,
          "fallback_target": "local",
          "reason_code": "PROVIDER_UNAVAILABLE",
          "user_message": "高级解析暂不可用，已切换基础解析，版面结构与公式识别可能不完整。",
          "trace_id": "trc_xxx"
        }
      }
    }
  },
  "message": "文件上传成功"
}
```

### 4.3 失败/不可用（video_understanding）
```json
{
  "success": true,
  "data": {
    "video_understanding": {
      "capability": "video_understanding",
      "provider": "Qwen-VL",
      "status": "unavailable",
      "fallback_used": false,
      "reason_code": "PROVIDER_UNAVAILABLE",
      "user_message": "视频理解功能暂不可用，请检查 DASHSCOPE_API_KEY 配置。",
      "trace_id": "trc_xxx"
    }
  },
  "message": "获取能力健康状态成功"
}
```

## 5. 字段缺失清单（需后续联调）
1. `Project Space` 契约字段（`artifact/version/candidate-change`）已在 target 定义，但后端路由尚未完整落地。
2. 解析/视频/语音三链路的错误响应尚未全部统一为根级 `error.code/retryable/trace_id` 结构。

## 6. 验收口径（D-Contract v1）
1. 三能力均能输出 CapabilityStatus（成功/降级/不可用至少覆盖其一）。
2. 前端可仅依赖 `status/fallback_used/reason_code/user_message` 做状态展示，不依赖文案猜测。
3. D4/D5 与 D-PS3 评测均可直接引用本文件字段。
4. 后续变更若新增字段，必须先更新 OpenAPI 与本文件，再进入实现。

## 7. 对 A/B/C 的对齐动作
1. A：用本文件第 2/5/6 节做契约守护评审。
2. B：按本文件第 2 节字段渲染状态与提示；不做字符串推断。
3. C：按第 5 节缺失清单补齐实现，并回填真实样例到联调记录。
