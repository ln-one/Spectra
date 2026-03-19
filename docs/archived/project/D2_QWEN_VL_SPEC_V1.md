# D2 规范先行（Qwen-VL，当前实现对齐）

## 版本信息
- 版本：v1.0
- 日期：2026-03-16
- 负责人：成员 D
- 目标：先冻结视频理解输入输出与降级语义，保证离线可测、可联调

## 1. 入口与职责边界
当前入口：
1. `POST /api/v1/files`（`file_type=video`）
2. `POST /api/v1/files/batch`（包含 `video` 文件）

链路职责：
1. `video_service.process_video()` 负责视频理解与降级策略。
2. `file_parser.extract_text_for_rag()` 将视频片段转为可索引文本与 `sources`。
3. 上传接口通过 `parse_result` 回传结构化结果与 `capability_status`。

## 2. 输入 Schema（实现口径）

```json
{
  "project_id": "string",
  "session_id": "string | null",
  "file": "multipart video binary",
  "file_type": "video",
  "provider": "Qwen-VL",
  "runtime_config": {
    "model": "qwen3.5-plus",
    "frame_interval_seconds": 30
  }
}
```

说明：
1. 当前实现不单独暴露 `segment_policy` API 字段，按服务端配置执行。
2. 会话隔离通过 `project_id + session_id` 在索引与检索侧生效。

## 3. 输出 Schema（实现口径）

```json
{
  "success": true,
  "data": {
    "file": {
      "id": "upload_xxx",
      "status": "ready",
      "parse_result": {
        "chunk_count": 3,
        "indexed_count": 3,
        "segments": [
          {
            "timestamp": 0.0,
            "content": "视频关键讲解片段",
            "confidence": 0.8,
            "chunk_id": "vid_xxx"
          }
        ],
        "sources": [
          {
            "chunk_id": "vid_xxx",
            "source_type": "video",
            "filename": "lesson.mp4",
            "timestamp": 0.0,
            "content_preview": "视频关键讲解片段"
          }
        ],
        "capability_status": {
          "capability": "video_understanding",
          "provider": "Qwen-VL",
          "status": "available | degraded",
          "fallback_used": true,
          "fallback_target": "metadata_parser",
          "reason_code": "PROVIDER_UNAVAILABLE | PROVIDER_TIMEOUT | PROVIDER_RATE_LIMITED | EMPTY_OUTPUT | INTERNAL_ERROR",
          "user_message": "string",
          "trace_id": "trc_xxx"
        }
      }
    }
  },
  "message": "文件上传成功"
}
```

## 4. Prompt 模板（v1）

system 指令：
```text
请提取该教学视频的关键内容，输出简要摘要。如果无法识别，请返回空字符串。
```

约束：
1. 输出必须可进入 `segments[].content`。
2. 不要求一次输出完整教案，仅输出可用于后续生成链路的关键片段。

## 5. 后处理规则（v1）
1. 统一输出 `segments[]`，每段至少包含 `timestamp/content/confidence/chunk_id`。
2. 统一输出 `sources[]`，供引用与溯源消费。
3. `content` 空值时进入降级路径，不返回“伪成功”。
4. 降级路径必须带 `capability_status`，并给出 `reason_code/user_message/trace_id`。
5. 降级保底文本可继续进入 RAG/生成主链路，不阻塞主流程。

## 6. 离线测试样例（必须可复现）
1. `DASHSCOPE_API_KEY` 缺失：返回 `status=degraded`，`fallback_target=metadata_parser`。
2. Qwen-VL 成功响应：返回 `status=available`，`segments` 非空。
3. Qwen-VL 空响应：返回 `status=degraded`，`reason_code=EMPTY_OUTPUT`。
4. `create_video_sources()`：确保 `chunk_id/source_type/filename/timestamp/content_preview` 映射完整。

## 7. 当前缺口（待联调）
1. 还没有独立的视频理解 API（当前绑定上传解析链路）。
2. 更细粒度结构（如 `knowledge_points`）尚未进入正式契约字段。
3. 真机联调门禁需在 C 侧接通后补全端到端样本。
