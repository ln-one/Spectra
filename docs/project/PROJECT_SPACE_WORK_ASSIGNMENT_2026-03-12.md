# Project Space Phase Assignment (2026-03-12)

> 目标：并行推进、强解耦、可验收。
> 说明：A=你（架构师），B=前端/交互，C=后端业务，D=后端AI。

## 0. 基本原则

- 以库模型为核心（对外语义=库，对内实现=Project/Session）。
- 全部通过 OpenAPI target 契约对齐，前后端不直接耦合实现细节。
- 各模块可并行，阻塞点仅限“契约与最小规则”。

## 0.1 当前基础（你已确认可用）

- 认证注册/登录已有基础可用。
- 项目主链路已有基础可用。
- Session-first 主链路已有基础可用（创建/查询/预览等）。

## 1. 分工（ABCD，明确到接口/功能）

### A（架构师）

必须实现：
- OpenAPI target 结构治理（已实现 vs target 的组织规则）。
- 统一错误响应与鉴权规则（ErrorResponse + 资源边界）。
- 契约校验（CI 或脚本，保证 OpenAPI target 与实现对齐）。

可选加固：
- Trace-Id / 统一日志规范 / 失败语义封装。

### B（前端）

必须实现（明确到功能入口）：
- 登录/注册/项目列表/项目详情完整链路。
- Session-first 生成链路：
  - 创建会话、事件流、预览、修改、导出。
- 8 类能力入口与结果页闭环：
  - ppt / word / mindmap / outline / quiz / summary / animation / handout
  - 每类：结果展示 + 导出/下载 + 进入历史列表
- 库模型入口：
  - 引用管理页（references 列表/新增/编辑/删除）
  - 版本与工件列表页（versions/artifacts）
  - 成员管理页（members）

### C（后端业务）

必须实现（目标新增接口全部由 C 负责落地）：
- `/api/v1/projects/{project_id}/references`（增删改查 + DAG 校验）
- `/api/v1/projects/{project_id}/versions`（列表/详情）
- `/api/v1/projects/{project_id}/artifacts`（列表/详情）
- `/api/v1/projects/{project_id}/members`（增删改查）
- `/api/v1/projects/{project_id}/candidate-changes`（列表）
- `/api/v1/projects/{project_id}/candidate-changes/{change_id}/review`（review）

必须实现（数据模型与规则）：
- ProjectReference 规则（主基底唯一、follow/pinned、引用可见性校验）。
- ProjectVersion / Artifact / Member 的最小可用 CRUD。
- Project 扩展字段落地：`base_project_id` / `reference_mode` / `visibility` / `is_referenceable` / `current_version_id`。
- 引用黑盒/透明可见性策略的最小实现（默认黑盒，公开库可透明）。

### D（后端AI）

必须实现：
- GenerationSession 全流程可跑（创建/查询/事件流/预览/导出联动）。
- CandidateChange 与生成流程绑定（产出候选变更）。
- 对话记忆引用接口（chromadb 切片引用，可被会话调用）。
- 预览/导出支持 artifact_id / based_on_version_id 的会话级落地与透传。

## 2. 本阶段全量功能目标（全部要做成可用）

8 类生成能力必须“可用闭环”（可发起生成 + 有结果展示 + 可导出/下载 + 可进历史）：

- PPT 课件（ppt）
- Word 文档（word）
- 思维导图（mindmap）
- 课程大纲（outline）
- 测验题目（quiz）
- 内容摘要（summary）
- 动画脚本（animation）
- 讲义（handout）

## 2.1 设计文档覆盖点（必须落地）

来自 2026-03-09/2026-03-12 文档的“强约束”，必须覆盖在实现里：

- 库创建的两种路径：新建元库 / 基于父库创建（base_project_id + reference_mode）
- 引用模式：follow / pinned（pinned 必须绑定 version）
- 多引用结构：1 个主基底 + 多个辅助引用
- 引用关系必须 DAG 校验
- 版本规则：只有“正式入库”产生版本
- 候选变更：提交 -> 审核 -> 合入生成新版本
- 导出物规则：artifact 必须记录来源库与版本
- 黑盒/透明可见性规则：默认黑盒，公开库可透明
- 会话隔离：对话/生成必须绑定 session_id
- 预览/导出支持 artifact_id 与 based_on_version_id

## 2.2 八个模态后端分工（必须覆盖，无遗漏）

原则：
- D 负责“生成与语义管线”（模型调用、生成流程、session 内产出）。
- C 负责“落库与结果服务”（artifact 记录、版本绑定、下载/导出、列表/详情接口）。
- 每个模态都必须落到 Artifact（记录来源 project/version/session）。

### PPT（ppt）
- D：会话生成流程、渲染任务触发、产出 PPT 结果元数据。
- C：artifact 记录（type=pptx）、下载/导出接口、版本绑定。

### Word（word）
- D：会话生成流程、文档结构生成。
- C：artifact 记录（type=docx）、下载/导出接口、版本绑定。

### 思维导图（mindmap）
- D：导图结构生成（节点/层级/关系）。
- C：artifact 记录（type=mindmap）、导出（json/image/other）与历史列表。

### 课程大纲（outline）
- D：大纲生成/改写/确认流（session 内）。
- C：artifact 记录（type=outline 或 summary 视实现）、版本锚点绑定。

### 测验题目（quiz）
- D：题目生成（题干/选项/答案/解析）。
- C：artifact 记录（type=exercise）、导出（json/docx）与列表接口。

### 内容摘要（summary）
- D：摘要生成（多粒度摘要）。
- C：artifact 记录（type=summary）、导出与历史列表。

### 动画脚本（animation）
- D：动画脚本/分镜生成（文本或结构化脚本）。
- C：artifact 记录（type=gif/mp4 或 animation_script 视实现）、导出与列表。

### 讲义（handout）
- D：讲义结构/内容生成（章节/要点/示例）。
- C：artifact 记录（type=handout 或 docx 视实现）、导出与列表。

## 3. 当前前端未完成清单（基于代码扫描）

- 生成结果页导出/分享/演示按钮未接通
  - 路径：`frontend/app/projects/[id]/generate/page.tsx`
- 生成结果页浮动工具栏按钮（编辑/排版/换图）未接通
  - 路径：`frontend/app/projects/[id]/generate/page.tsx`
- 各生成能力没有独立的“结果展示 + 导出/下载”闭环入口
  - 当前仅 PPT/幻灯片预览页
  - 路径：`frontend/app/projects/[id]/generate/page.tsx`
- 认证 Store TODO 注释未清理（逻辑已实现）
  - 路径：`frontend/stores/authStore.ts`
- 首页“演示视频暂未上线”（不影响功能，但需确认是否保留）
  - 路径：`frontend/app/page.tsx`

## 3.1 API 两套版本差异（基于 OpenAPI 入口扫描）

说明：
- 已实现：`docs/openapi-source.yaml`（当前后端接口）
- 目标版本：`docs/openapi-target-source.yaml`（目标契约）

目标版本相较已实现新增 10 个路径，全部在库模型扩展域：

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

## 3.2 关键差距清单（来自 2026-03-12 GAP 报告）

- Project 扩展字段：`base_project_id` / `reference_mode` / `visibility` / `is_referenceable` / `current_version_id`
- Project References（增删改查 + DAG + is_referenceable 检查）
- Project Versions / Artifacts / Members / CandidateChanges 全套子资源
- 预览/导出返回字段：`artifact_id` / `based_on_version_id`

## 4. 依赖顺序（按依赖关系，不按时间）

### Phase-0：契约与基础设施（A 已基本完成）
- OpenAPI target 结构治理
- ErrorResponse 统一格式
- 鉴权/资源边界规则
- Prisma 最小骨架模型

### Phase-1：主链路补齐（在已有基础上完善）
- 补齐文件解析状态与前端展示
- 补齐会话事件流与前端实时刷新
- 补齐大纲编辑/确认的稳定路径
- 补齐 Session 预览的完整可用体验

### Phase-2：8 类能力闭环
- 每类能力的结果展示组件
- export/download 链路
- 工件/版本与 session 绑定
- 前端入口与结果页对齐

### Phase-3：库模型进阶能力
- 引用关系配置与可视化
- 成员与权限
- 候选变更/合入
- 版本对比

## 5. 交付验收口径

- 任一能力不可仅“能生成”，必须“可展示 + 可导出 + 可进历史”。
- 所有接口以 OpenAPI target 为准。
- 旧接口仅做兼容层，不作为新功能入口。

## 6. 未分配项检查（已明确分配）

- 项目创建时基于父库自动创建主基底引用（base_project_id -> reference）
  - 负责人：C
- 引用 DAG 校验失败的错误码与 409 冲突处理
  - 负责人：C（实现）/ A（错误码规范）
- CandidateChange accept/reject 的版本落地与冲突处理
  - 负责人：C（版本落地）/ D（生成侧产出候选变更）
- artifact 下载/导出文件存储与访问路径规范
  - 负责人：C
- session 历史成果列表按类型分组（仅展示当前 session 产出）
  - 负责人：B（UI）/ D（会话侧产出数据）/ C（artifact 查询接口）
- 预览/导出字段透传（artifact_id / based_on_version_id）
  - 负责人：D（会话接口）/ C（artifact 绑定）
- 统一契约校验与类型生成（OpenAPI -> 前端/后端类型）
  - 负责人：A（规范与校验）/ B（前端类型生成）/ C（后端 schema 生成）
