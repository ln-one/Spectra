# D3 规范先行（Faster-Whisper，当前实现对齐）

## 版本信息
- 版本：v1.0
- 日期：2026-03-16
- 负责人：成员 D
- 目标：冻结语音识别输入输出、降级语义和 `/chat/voice` 返回协议

## 1. 入口与职责边界
入口：
1. `POST /api/v1/chat/voice`（`multipart/form-data`）

链路职责：
1. `audio_service.transcribe_audio()`：执行识别并返回 `CapabilityStatus`。
2. `chat.voice_message()`：落库 user/assistant 消息并返回响应协议。
3. `/api/v1/health/capabilities`：提供语音能力健康状态。

## 2. 识别参数基线（当前实现）

```json
{
  "provider": "Faster-Whisper",
  "model_size": "env:WHISPER_MODEL_SIZE (default=base)",
  "device": "env:WHISPER_DEVICE (default=cpu)",
  "compute_type": "env:WHISPER_COMPUTE_TYPE (default=int8)",
  "language": "zh",
  "beam_size": 5,
  "vad_filter": true
}
```

说明：
1. 不依赖外部模型路由，当前固定由 `audio_service` 执行识别。
2. 未安装 `faster_whisper` 时进入可解释降级。

## 3. `/chat/voice` 响应契约（当前口径）

```json
{
  "success": true,
  "data": {
    "session_id": "sess_xxx",
    "text": "识别文本",
    "confidence": 0.86,
    "duration": 13.2,
    "message": {
      "id": "msg_xxx",
      "role": "assistant",
      "content": "收到语音需求...",
      "timestamp": "2026-03-16T09:00:00Z",
      "citations": []
    },
    "rag_hit": false,
    "capability_status": {
      "capability": "speech_recognition",
      "provider": "Faster-Whisper",
      "status": "available | degraded | unavailable",
      "fallback_used": true,
      "fallback_target": "manual_text_input",
      "reason_code": "PROVIDER_UNAVAILABLE | PROVIDER_TIMEOUT | PROVIDER_RATE_LIMITED | EMPTY_OUTPUT | INTERNAL_ERROR",
      "user_message": "string",
      "trace_id": "trc_xxx"
    },
    "observability": {
      "request_id": "req_xxx",
      "route_task": "speech_recognition",
      "selected_model": "Faster-Whisper",
      "has_rag_context": false,
      "fallback_triggered": true,
      "latency_ms": 123.4
    },
    "suggestions": ["补充教学目标", "补充参考资料", "开始生成课件"]
  },
  "message": "语音识别成功"
}
```

## 4. 文本与降级规则（v1）
1. 识别为空时不返回伪成功文案，使用 `capability_status.user_message`。
2. 异常按原因映射：
   - 包含 `timeout` -> `PROVIDER_TIMEOUT`
   - 包含限流语义 -> `PROVIDER_RATE_LIMITED`
   - 其他异常 -> `INTERNAL_ERROR`
3. 空结果映射 `EMPTY_OUTPUT`，并进入 `degraded`。
4. 能力不可用时回退目标固定为 `manual_text_input`。

## 5. 离线测试样例（必须可复现）
1. 无 `faster_whisper` 依赖 -> `status=unavailable`。
2. 正常识别 -> `status=available` 且 `text` 非空。
3. 空 segments -> `status=degraded` 且 `reason_code=EMPTY_OUTPUT`。
4. 异常包含 timeout -> `reason_code=PROVIDER_TIMEOUT`。
5. `/chat/voice` 响应必须显式包含：
   - `rag_hit=false`
   - `message.citations=[]`
   - `observability.route_task=speech_recognition`

## 6. 当前缺口（待联调）
1. 语音识别后仍返回固定 assistant 保底回复，尚未接入更完整的生成链路。
2. `/chat/voice` 还未引入按资料引用的 RAG 消费链路（当前固定空命中）。
3. 端到端质量门禁需待 C 侧语音执行链路全量接线后补齐。
