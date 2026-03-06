# 成员 A 交付物（A1/A2）

> 日期：2026-03-06
> 角色：架构师 / Tech Lead
> 关联文档：`docs/project/phase-role-assignment.md`

## 成员 A 任务进度（截至 2026-03-06）

1. A1 完整产品范围冻结：**已完成**（本文件第 1 节）。
2. A2 跨能力编排与契约守护：**已完成**（本文件第 2 节，含评审结论）。
3. A3 上线门禁（产品级）：**已完成**（见 `docs/project/A3_RELEASE_GATES_CHECKLIST_2026-03-06.md`）。
4. A4 会话化数据模型与数据流架构收敛：**已完成**（见本节新增架构产出索引）。

## A4 架构产出索引（2026-03-06）

1. 数据模型修订（会话化目标模型）：`docs/architecture/backend/data-models.md`
2. 数据流修订（NotebookLM 三栏 + Gamma 会话流）：`docs/architecture/system/data-flow.md`
3. 系统概览修订（会话化主线）：`docs/architecture/system/overview.md`

## A1 完整产品范围冻结（按用户旅程）

### 1) 本阶段必须可用（In Scope）

1. 配置输入：用户可提交课件目标、学段/学科、输出偏好。
2. 大纲共创：系统返回可编辑大纲，支持用户修改。
3. 确认生成：用户确认大纲后进入正式生成。
4. 预览编辑：支持页面级预览与内容修改。
5. 局部重绘：支持指定页面/区块重生成。
6. 导出：支持可下载导出（至少 PPT/Word 之一可稳定可用）。
7. 可溯源：关键输出存在来源入口（至少 chunk/file/page/time 维度之一可读）。
8. 能力降级：外部能力异常不阻断主流程，且返回可展示提示语。

### 2) 本阶段不纳入上线口径（Out of Scope）

1. 高级视觉动效和重品牌化 UI 打磨。
2. 多人实时协同编辑。
3. 全量外部能力 100% 精度对齐（允许“可用但有差异”）。

### 3) 上线可用口径（冻结）

- 口径：完成上述 8 项 In Scope 且无 P0 阻塞缺陷，即视为“上线可用”。
- 变更规则：新增范围必须先更新本文件并通过 A/C/B 联审，不接受口头扩项。

## A2 跨能力编排与契约守护

## 2.1 统一编排边界

- 统一入口：生成会话（session）状态机驱动全流程。
- 三能力统一语义：`document_parser` / `video_understanding` / `speech_recognition`。
- 统一降级字段：`status`、`fallback_used`、`fallback_target`、`reason_code`、`user_message`。
- 统一可追踪字段：`trace_id`。

## 2.2 模块边界（接口责任）

### B（前端）
- 只依赖契约字段渲染状态与提示，不做隐式推断。
- 对 `fallbacks[]` 与来源字段提供可见入口。

### C（后端）
- 保证三能力在成功/降级/失败三类路径都返回统一语义字段。
- 保证状态机流转可恢复、可追踪、可重试。

### D（AI/RAG）
- 保证能力输入输出结构与质量基线可映射到统一契约字段。
- 提供降级质量下限与抽样依据。

## 2.3 契约评审结论（2026-03-06）

结论：**需改动后通过（当前未通过）**。

### 阻塞项（Blocking）

1. 文档解析主备能力未真实接入：`MinerU/LlamaParse` 仍为骨架，返回空文本由上层兜底。
   - 证据：`backend/services/parsers/mineru_provider.py`、`backend/services/parsers/llamaparse_provider.py`
2. 语音链路未接入真实 Whisper：`/chat/voice` 当前返回占位识别文本。
   - 证据：`backend/routers/chat.py`
3. 视频理解链路未见真实 Qwen-VL 执行入口与结构化返回。
   - 证据：现有 router 中无独立视频理解执行链路，相关能力仍处规划/契约层。

### 非阻塞但必须跟进（Non-blocking）

1. 前后端需统一使用会话状态机主入口，逐步收敛 legacy 生成任务接口。
2. 三能力真实样例（成功/降级/失败各 1）需沉淀到联调样例库。
