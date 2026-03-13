# Project Space Work Assignment (Clean) — 2026-03-12

> 目的：给团队一个“可执行、无歧义、覆盖完整”的分工清单。
> 说明：A=架构师，B=前端，C=后端业务，D=后端AI。

## 1. 基线事实（当前可用）

- 注册/登录可用
- 项目主链路可用
- Session-first 主链路可用（创建/查询/预览等）

## 2. 总体原则

- 以库模型为核心（对外语义=库，对内实现=Project/Session）
- 契约优先（OpenAPI target 为唯一对齐基准）
- 并行推进，阻塞点仅限“契约与最小规则”

## 3. 分工（所有事项归口到人）

### A（架构师）

必须实现：
- OpenAPI target 结构治理（已实现 vs target 的组织规则）
- 统一错误响应与鉴权规则（ErrorResponse + 资源边界）
- 契约校验（CI 或脚本，确保实现与 target 对齐）
- DAG 校验/冲突类错误码规范（供后端实现）

可选加固：
- Trace-Id / 统一日志规范 / 失败语义封装

### B（前端）

必须实现：
- 登录/注册/项目列表/项目详情链路完整可用
- Session-first 生成链路：创建会话、事件流、预览、修改、导出
- session 历史成果按类型分组（仅展示当前 session）
- 8 类能力闭环入口（每类：结果展示 + 导出/下载 + 进入历史）
  - ppt / word / mindmap / outline / quiz / summary / animation / handout
- 库模型入口页面：
  - 引用管理（references 列表/新增/编辑/删除）
  - 版本与工件列表（versions/artifacts）
  - 成员管理（members）
- 契约类型生成（OpenAPI -> 前端 types）

### C（后端业务）

必须实现（target 新增接口）：
- `/api/v1/projects/{project_id}/references`（增删改查 + DAG 校验）
- `/api/v1/projects/{project_id}/versions`（列表/详情）
- `/api/v1/projects/{project_id}/artifacts`（列表/详情）
- `/api/v1/projects/{project_id}/members`（增删改查）
- `/api/v1/projects/{project_id}/candidate-changes`（列表）
- `/api/v1/projects/{project_id}/candidate-changes/{change_id}/review`（review）

必须实现（规则与模型）：
- Project 扩展字段：`base_project_id` / `reference_mode` / `visibility` / `is_referenceable` / `current_version_id`
- base_project_id 创建主基底引用（自动生成 reference）
- ProjectReference 规则（主基底唯一、follow/pinned、引用可见性校验）
- 引用黑盒/透明可见性最小实现（默认黑盒，公开库可透明）
- ProjectVersion / Artifact / Member 最小可用 CRUD
- CandidateChange 审核合入 -> 新版本落地
- artifact 下载/导出存储与访问路径规范
- 预览/导出字段透传所需的 artifact 绑定
- 契约类型生成（OpenAPI -> 后端 schema/模型）
- 8 类能力的 Artifact 落库与导出服务：
  - ppt -> artifact(type=pptx) + 下载/导出
  - word -> artifact(type=docx) + 下载/导出
  - mindmap -> artifact(type=mindmap) + 导出/历史
  - outline -> artifact(type=outline 或 summary) + 版本锚点
  - quiz -> artifact(type=exercise) + 导出/历史
  - summary -> artifact(type=summary) + 导出/历史
  - animation -> artifact(type=gif/mp4/animation_script) + 导出/历史
  - handout -> artifact(type=handout 或 docx) + 导出/历史

### D（后端AI）

必须实现：
- GenerationSession 全流程可跑（创建/查询/事件流/预览/导出联动）
- CandidateChange 产出与生成流程绑定
- 对话记忆引用接口（chromadb 切片引用）
- 预览/导出支持 `artifact_id` / `based_on_version_id` 的会话级透传
- session 历史成果产出数据（供前端分组展示）
- 8 类能力的生成语义与产出：
  - ppt：生成与渲染任务
  - word：文档结构生成
  - mindmap：导图结构生成（节点/层级/关系）
  - outline：大纲生成/改写/确认流
  - quiz：题干/选项/答案/解析生成
  - summary：摘要生成
  - animation：脚本/分镜生成
  - handout：讲义结构/内容生成

## 4. 设计文档覆盖点（必须落地）

- 新建元库 / 基于父库创建（base_project_id + reference_mode）
- follow / pinned（pinned 必须绑定 version）
- 主基底 + 多辅助引用
- 引用关系 DAG 校验
- 版本只在“正式入库”时产生
- 候选变更：提交 -> 审核 -> 合入新版本
- artifact 必须记录来源库与版本
- 黑盒/透明可见性规则
- 会话隔离（对话/生成绑定 session_id）
- 预览/导出支持 artifact_id / based_on_version_id

## 5. API 差异（已实现 vs 目标）

- 已实现：`docs/openapi-source.yaml`
- 目标契约：`docs/openapi-target-source.yaml`
- 目标新增（未实现）：
  - `/api/v1/projects/{project_id}/references`
  - `/api/v1/projects/{project_id}/references/{reference_id}`
  - `/api/v1/projects/{project_id}/versions`
  - `/api/v1/projects/{project_id}/versions/{version_id}`
  - `/api/v1/projects/{project_id}/artifacts`
  - `/api/v1/projects/{project_id}/artifacts/{artifact_id}`
  - `/api/v1/projects/{project_id}/members`
  - `/api/v1/projects/{project_id}/members/{member_id}`
  - `/api/v1/projects/{project_id}/candidate-changes`
  - `/api/v1/projects/{project_id}/candidate-changes/{change_id}/review`

## 6. 验收口径

- 任一能力不可仅“能生成”，必须“可展示 + 可导出 + 可进历史”
- 所有接口以 OpenAPI target 为准
- 旧接口仅作兼容层，不作为新功能入口
