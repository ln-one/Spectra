# 前端导向设计：课件生成交互流

## 阶段一：配置（Configure）

用户完成：
- 输出类型与视觉风格选择。
- 受众、时长、素材范围确认。
- 主基调 Prompt 输入。

提交后进入：`ANALYZING -> DRAFTING_OUTLINE`。

## 阶段二：大纲共创（Outline Alignment）

用户能力：
- 编辑章节标题与关键点。
- 拖拽重排、增删节点。
- 提交“重写请求”让 AI 回到草拟阶段。

关键动作：
- 保存用户编辑：`PUT /generate/sessions/{session_id}/outline`
- 请求 AI 重写：`POST /generate/sessions/{session_id}/outline/redraft`
- 确认继续生成：`POST /generate/sessions/{session_id}/confirm`

## 阶段三：预览与局部微调（Living Preview）

用户能力：
- 左侧缩略图导航。
- 中央舞台实时预览。
- 右侧指令助理对单页发起修改。

关键动作：
- 单页局部重绘：`POST /generate/sessions/{session_id}/slides/{slide_id}/regenerate`

约束：
- 局部重绘不得触发全量闪烁刷新。
- 重绘失败时保留当前页面版本并给出可重试提示。
