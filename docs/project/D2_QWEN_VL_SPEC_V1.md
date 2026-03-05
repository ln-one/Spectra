# D2 规范先行（Qwen-VL）

## 版本信息
- 版本：v1.0-draft
- 日期：2026-03-05
- 负责人：成员 D
- 依赖状态：C3 未完成真实通道接入，本规范先用于接口对齐与联调准备

## 1. 输入 Schema（建议）

```json
{
  "project_id": "string",
  "file_id": "string",
  "capability": "video_understanding",
  "provider": "Qwen-VL",
  "segment_policy": {
    "mode": "fixed|scene_change",
    "max_segment_seconds": 30,
    "overlap_seconds": 3
  },
  "context": {
    "course_subject": "string",
    "grade": "string",
    "teaching_goal": "string"
  },
  "prompt_template_id": "qwen_vl_teaching_extract_v1"
}
```

## 2. 输出 Schema（建议）

```json
{
  "capability": "video_understanding",
  "provider": "Qwen-VL",
  "status": "available|degraded|unavailable",
  "fallback_used": false,
  "fallback_target": null,
  "reason_code": null,
  "user_message": "string",
  "segments": [
    {
      "segment_id": "seg-001",
      "timestamp_start": "00:01:10",
      "timestamp_end": "00:01:35",
      "content": "该片段讲解牛顿第二定律",
      "knowledge_points": ["牛顿第二定律", "F=ma"],
      "confidence": 0.87
    }
  ],
  "sources": [
    {
      "chunk_id": "vid-chunk-001",
      "source_type": "video",
      "filename": "lesson.mp4",
      "timestamp": "00:01:10",
      "preview_text": "牛顿第二定律..."
    }
  ],
  "trace_id": "trc_xxx"
}
```

## 3. 提示词模板（v1）

### system
```text
你是教学视频理解助手。请将视频片段解析为可用于课件生成的结构化信息。
输出必须是 JSON，不要输出多余说明。
```

### user
```text
课程学科：{course_subject}
年级：{grade}
教学目标：{teaching_goal}

请从以下视频片段中提取：
1) 关键知识点（最多5个）
2) 可直接用于课件页面的讲解片段（1-3条）
3) 每条片段给出置信度（0-1）

视频片段描述：
{segment_text_or_caption}
```

## 4. 后处理规则（v1）
1. 去重：同义知识点合并，最长表述保留。
2. 术语标准化：统一公式/术语写法（如 `F=ma`）。
3. 低置信标记：`confidence < 0.6` 标记为 `needs_review=true`。
4. 输出截断：`content` 最大 240 字，超出截断并加省略号。
5. 空结果兜底：若 `segments` 为空，返回 `status=degraded` + `reason_code=EMPTY_OUTPUT`。

## 5. 成功/降级样例

### 成功样例
```json
{
  "capability": "video_understanding",
  "provider": "Qwen-VL",
  "status": "available",
  "fallback_used": false,
  "segments": [
    {
      "segment_id": "seg-001",
      "timestamp_start": "00:00:12",
      "timestamp_end": "00:00:40",
      "content": "讲解光合作用定义与发生场所。",
      "knowledge_points": ["光合作用", "叶绿体"],
      "confidence": 0.9
    }
  ]
}
```

### 降级样例
```json
{
  "capability": "video_understanding",
  "provider": "Qwen-VL",
  "status": "degraded",
  "fallback_used": true,
  "fallback_target": "caption_only_parser",
  "reason_code": "PROVIDER_TIMEOUT",
  "user_message": "视频理解超时，已切换字幕解析，结果可能缺少画面信息"
}
```

## 6. 联调检查项（给 C/B）
1. C：保证返回 `status/fallback_used/reason_code/user_message`。
2. C：保证 `segments[].timestamp_*` 与 `sources[].timestamp` 可回溯。
3. B：按 `status` 和 `fallback_*` 展示能力状态与提示文案。
