# Studio 卡片后端协议

> 更新时间：2026-03-19
> 目标：让前端卡片分支与后端语义主线在同一套协议上收口。

## 1. 当前入口

- `GET /api/v1/generate/capabilities`
  - 返回生成域能力声明，同时附带 `studio_cards`
- `GET /api/v1/generate/studio-cards`
  - 返回完整卡片目录
- `GET /api/v1/generate/studio-cards/{card_id}`
  - 返回单张卡片的协议细节

## 2. 卡片目录字段

每张卡片当前都会暴露：

- `id`
- `title`
- `readiness`
- `context_mode`
- `execution_mode`
- `primary_capabilities`
- `related_capabilities`
- `artifact_types`
- `session_output_type`
- `requires_source_artifact`
- `supports_chat_refine`
- `supports_selection_context`
- `config_fields`
- `actions`
- `notes`

## 3. 协议解释

### `readiness`

- `ready`
  - 后端协议与主路径已经可以直接承托卡片
- `foundation_ready`
  - 基础能力与产物承载已经具备，但卡片级交互协议仍需继续补齐
- `protocol_pending`
  - 基础对象已能承托，但专用产品协议尚未正式建模完成

### `context_mode`

- `session`
  - 卡片主要依赖当前会话上下文
- `artifact`
  - 卡片主要依赖某类 artifact 产物
- `hybrid`
  - 同时依赖 session 与 artifact 语义

### `execution_mode`

- `session_command`
  - 主要通过会话命令推进
- `artifact_create`
  - 主要通过 artifact 创建能力推进
- `composite`
  - 需要跨 `session / artifact / chat` 多个子协议协作

## 4. 当前卡片映射

### `word_document`

- `readiness`: `foundation_ready`
- `execution_mode`: `composite`
- `session_output_type`: `word`
- 说明：文档/讲义基础承载已具备，适合优先落卡片化

### `interactive_quick_quiz`

- `readiness`: `foundation_ready`
- `execution_mode`: `artifact_create`
- 说明：题目 artifact 已具备，后续重点在单题交互协议

### `knowledge_mindmap`

- `readiness`: `foundation_ready`
- `execution_mode`: `artifact_create`
- `supports_selection_context`: `true`

### `demonstration_animations`

- `readiness`: `foundation_ready`
- `execution_mode`: `artifact_create`
- 说明：storyboard 与媒体输出已有承载，参数热更新仍待补齐

### `interactive_games`

- `readiness`: `protocol_pending`
- `execution_mode`: `artifact_create`
- 说明：HTML artifact 可承载，但专用 game 协议尚未正式落地

### `speaker_notes`

- `readiness`: `protocol_pending`
- `execution_mode`: `composite`
- `session_output_type`: `ppt`
- `requires_source_artifact`: `true`

### `classroom_qa_simulator`

- `readiness`: `protocol_pending`
- `execution_mode`: `composite`
- `context_mode`: `session`

## 5. 集成建议

前端卡片分支应优先依赖：

1. `card_id`
2. `readiness`
3. `execution_mode`
4. `config_fields`
5. `supports_chat_refine`
6. `supports_selection_context`

不要在前端自行推断：

- 哪张卡片是否依赖 source artifact
- 哪张卡片是否更偏 session-first
- 哪张卡片当前是否已达可落地成熟度

这些判断应以后端协议为准。
