# Studio 卡片后端协议

> 更新时间：2026-04-22
> 状态：`current`
> 目标：让 Studio 卡片前后端在同一套执行与 artifact 生命周期协议上收口。

## 1. 当前入口

- `GET /api/v1/generate/capabilities`
  - 返回生成域能力声明，同时附带 `studio_cards`
- `GET /api/v1/generate/studio-cards`
  - 返回完整卡片目录
- `GET /api/v1/generate/studio-cards/{card_id}`
  - 返回单张卡片的协议细节
- `GET /api/v1/generate/studio-cards/{card_id}/execution-plan`
  - 返回单张卡片当前可落地的后端执行绑定与协议缺口
- `POST /api/v1/generate/studio-cards/{card_id}/execution-preview`
  - 根据卡片配置返回可直接调用的后端请求预览
- `POST /api/v1/generate/studio-cards/{card_id}/execute`
  - 对 `foundation_ready` 卡片直接执行初始动作并返回实际落地结果
- `GET /api/v1/generate/studio-cards/{card_id}/sources`
  - 返回当前卡片可绑定的源成果列表

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

- `readiness`: `foundation_ready`
- `execution_mode`: `artifact_create`
- 说明：`interactive_game.v2` HTML artifact 已是当前正式承载

### `speaker_notes`

- `readiness`: `foundation_ready`
- `execution_mode`: `composite`
- `session_output_type`: `ppt`
- `requires_source_artifact`: `true`
- 说明：`source-binding + 初始执行 + refine 预览` 已具备，段落锚点协议仍待补齐

### `classroom_qa_simulator`

- `readiness`: `foundation_ready`
- `execution_mode`: `composite`
- `context_mode`: `hybrid`
- 说明：summary artifact 预演脚本与初始执行已具备，虚拟学生多轮问答仍待补齐

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

## 6. 执行协议

`execution-plan` 会把每张卡片当前真实可走的后端路径说清楚，而不是让前端自行猜测。

每张卡片会暴露：

- `initial_binding`
  - 当前第一步应该打到哪个接口
- `refine_binding`
  - 当前局部改写应依赖哪条链路
- `source_binding`
  - 当前是否需要先绑定某个 artifact/source

### `status` 语义

- `ready`
  - 该绑定已经可以直接作为正式产品协议使用
- `partial`
  - 主通道已存在，但仍有配置字段或局部语义尚未绑定
- `pending`
  - 方向已确定，但专用协议还未完全落地

### 当前重点

`foundation_ready` 的核心卡片现在都已经开始暴露 `execution-plan`：

- `word_document`
- `interactive_quick_quiz`
- `knowledge_mindmap`
- `demonstration_animations`
- `interactive_games`

这意味着前端现在不只是知道“卡片存在”，还知道：

- 第一跳该打哪个后端入口
- 哪些配置字段已经正式绑定
- 哪些字段仍处于协议缺口
- 最终应该从哪个结果字段里取回 session / artifact

## 7. 执行预览

`execution-preview` 用来把前端卡片配置真正绑定到后端请求。

它解决的问题是：

- 卡片配置不再只是“知道有哪些字段”
- 前端不再需要自己拼接 create-session / create-artifact / chat 请求
- 后端会明确告诉前端：当前配置会变成什么 payload

当前已经能预览：

- `word_document`
- `interactive_quick_quiz`
- `knowledge_mindmap`
- `demonstration_animations`
- `interactive_games`
- `speaker_notes`
- `classroom_qa_simulator`

这意味着这些 foundation-ready 卡片，已经从：

- “执行绑定已知”

继续推进到了：

- “配置字段可映射成正式请求预览”

同时：

- `word_document / interactive_quick_quiz / knowledge_mindmap / demonstration_animations / interactive_games`
  现在都可以把卡片配置正式映射到 artifact 创建或 refine 请求

同时：

- refine 预览里附带的 `metadata`
  现在可以被 `/api/v1/chat/messages` 正式接收并进入 prompt 语境
  不再只是“给前端看的占位字段”

## 8. 直接执行

`execute` 用来把前端卡片从“知道怎么调”推进到“后端帮你直接落地”。

当前已经支持初始执行：

- `word_document`
- `interactive_quick_quiz`
- `knowledge_mindmap`
- `demonstration_animations`

## 9. Refine 执行

`refine` 用来把卡片从“知道如何改”推进到“后端帮你通过正式协议真正执行更新”。

当前已经支持：

- `POST /api/v1/generate/studio-cards/{card_id}/refine`

当前四张核心 managed 卡片要遵守同一条生命周期原则：

- `new draft -> new artifact`
- `history click -> pinned artifact`
- `refine / save -> same artifact`
- `run` 只用于处理中恢复、轮询、审计，不决定默认结果

其中 refine 载体分两类：

- `word_document`
  - 直接编辑保存属于 direct edit，更新原 artifact
  - chat refine 仍可走 AI rewrite / RAG，但也必须绑定原 artifact
- `interactive_quick_quiz`
  - 单题修改/保存更新原 quiz artifact
- `knowledge_mindmap`
  - 节点编辑/删改/扩展更新原 mindmap artifact
- `interactive_games`
  - 游戏规则与交互参数 refine 更新原 `interactive_game.v2` artifact

这意味着前端不应再把这四张卡理解成：

- refine 产生 replacement artifact
- `{session_id, tool_type}` 推导唯一 current result
- history click 可以退回 session latest / run latest

执行结果会明确返回：

- `transport`
- `resource_kind`
- `session` 或 `artifact`
- `request_preview`

这意味着前端现在不只可以读取执行计划，也可以直接把多张 `foundation_ready` 卡片真正落成：

- 文档卡片 -> session
- quiz / mindmap / animation / game / classroom-simulator 卡片 -> artifact
- speaker-notes 卡片 -> 绑定 source artifact 后创建 session

现在已经进入 `foundation_ready` 的包括：

- `interactive_games`
- `speaker_notes`
- `classroom_qa_simulator`

而 `classroom_qa_simulator` 当前仍然是以“预演脚本原型”承托学情预演；
更深的虚拟学生多轮问答仍诚实保留为后续协议。

## 9. 源成果绑定

`sources` 用来让前端不再自己推断“哪些 artifact 可以拿来作为这张卡片的输入”。

当前已经支持：

- `speaker_notes` -> `pptx`

返回结果会尽量给出：

- `id`
- `type`
- `title`
- `visibility`
- `based_on_version_id`
- `session_id`
- `updated_at`

这意味着组合型卡片虽然还没有完全 ready，但它们的 source-binding 已经开始拥有正式协议，而不是继续依赖前端猜测或硬编码。

同时，`speaker_notes` 现在已经可以：

- 先通过 `sources` 拉取可选 `pptx`
- 再通过 `execute` 直接带 `source_artifact_id` 落地创建 session

也就是说，它已经从纯粹的“协议待定”推进到了“组合协议基础可执行”。
