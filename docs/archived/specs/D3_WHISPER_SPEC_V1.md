# D3 规范先行（Faster-Whisper）

## 版本信息
- 版本：v1.0-draft
- 日期：2026-03-05
- 负责人：成员 D
- 依赖状态：C3 未完成真实语音通道，本规范先用于契约对齐

## 1. 音频预处理规范
1. 采样率统一：16kHz（单声道）。
2. 分段策略：
   - 默认每段 20-30 秒；
   - 段间重叠 1-2 秒，避免断句丢词。
3. 静音切分：连续静音 > 700ms 可切段。
4. 噪声场景：先做轻量降噪，再识别。

## 2. 识别参数基线（建议）

```json
{
  "provider": "Faster-Whisper",
  "model_size": "small",
  "language": "zh",
  "beam_size": 5,
  "temperature": 0.0,
  "vad_filter": true,
  "word_timestamps": true,
  "confidence_threshold": 0.6
}
```

## 3. 文本清洗规则（v1）
1. 去除口语冗余（如“嗯”“然后我们这个”）。
2. 恢复基础标点并做句子断句。
3. 教学术语标准化（统一课程术语写法）。
4. 保留关键专有名词（人名/公式/单位）。

## 4. 错误与降级语义（v1）

原因码建议：
- `AUDIO_DECODE_FAILED`
- `ASR_TIMEOUT`
- `LOW_CONFIDENCE`
- `EMPTY_TRANSCRIPT`
- `PROVIDER_UNAVAILABLE`

降级策略建议：
1. 首次失败：重试 1 次（同参数）。
2. 低置信：切更保守参数（或更大模型）重试。
3. 仍失败：返回 `status=degraded|unavailable` + 用户可读提示。

## 5. `/chat/voice` 目标契约草案

### 当前实现（现状）
- 返回占位识别文本（非真实 Whisper）。

### 目标响应（建议）
```json
{
  "success": true,
  "data": {
    "capability": "speech_recognition",
    "provider": "Faster-Whisper",
    "status": "available|degraded|unavailable",
    "fallback_used": false,
    "fallback_target": null,
    "reason_code": null,
    "user_message": "string",
    "text": "识别文本",
    "confidence": 0.86,
    "duration": 13.2,
    "message": {
      "id": "msg_xxx",
      "role": "assistant",
      "content": "收到语音需求...",
      "timestamp": "2026-03-05T09:00:00Z"
    },
    "suggestions": ["补充教学目标", "开始生成课件"],
    "trace_id": "trc_xxx"
  },
  "message": "语音识别成功"
}
```

## 6. 成功/降级样例

### 成功
```json
{
  "capability": "speech_recognition",
  "provider": "Faster-Whisper",
  "status": "available",
  "text": "牛顿第二定律是力学核心定律之一",
  "confidence": 0.91,
  "duration": 8.4
}
```

### 降级
```json
{
  "capability": "speech_recognition",
  "provider": "Faster-Whisper",
  "status": "degraded",
  "fallback_used": true,
  "fallback_target": "keyword_parser",
  "reason_code": "LOW_CONFIDENCE",
  "user_message": "语音识别质量较低，已切换关键词提取模式"
}
```

## 7. 联调检查项（给 C/B）
1. C：确保 `/chat/voice` 返回 `status/fallback_*` 字段。
2. C：失败与降级路径必须可复现（至少 1 条样例）。
3. B：按 `status` 与 `reason_code` 展示明确提示，不做隐式猜测。
