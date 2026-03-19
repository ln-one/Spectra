# 剩余工作战役清单

> 更新时间：2026-03-19
> 目的：把 `docs/project/` 中的目标设计，映射成当前阶段真正还没完成、但最值得继续推进的工作。

## 1. 核心判断

当前系统已经不再缺“主干骨架”：

- `project + session` 主链路已形成
- `project_space` 子资源已基本落地
- `candidate-change / artifact_anchor / based_on_version_id` 已进入主流程
- `router / service / package` 第一轮重构已完成

当前真正缺的，不再是“大功能有没有”，而是：

1. 资源语义是否真正闭环
2. 生成链路是否真正稳定
3. AI / RAG / Citation 协议是否真正收口
4. 系统是否具备迁库、部署、商业化前的稳态基础

所以接下来的工作，不应再以“补接口”为主，而应以“补产品本体、补稳态、补部署底座”为主。

---

## 2. 设计目标回看

根据以下文档：

- `/Users/ln1/Projects/Spectra/docs/project/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md`
- `/Users/ln1/Projects/Spectra/docs/project/PROJECT_SPACE_API_DRAFT_2026-03-09.md`
- `/Users/ln1/Projects/Spectra/docs/project/D_CONTRACT_V1.md`
- `/Users/ln1/Projects/Spectra/docs/project/requirements.md`

当前系统最终想要的不是“一个能生成 PPT 的工具”，而是：

- 以 `Project` 作为统一知识空间
- 以 `Session` 作为独立工作上下文
- 以 `Reference` 作为跨空间复用机制
- 以 `Version` 作为正式状态锚点
- 以 `Artifact` 作为结果外化
- 以多轮对话 + 多模态资料 + RAG + 生成 + 修改 + 导出形成完整闭环

换句话说：

**系统本体是库与引用关系，不是单次导出结果。**

---

## 3. 已完成到什么程度

### 已有稳定主干

1. `project + session` 主链路
2. `generate_sessions` 的生成、预览、修改、导出
3. `project_space` 的 `references / versions / artifacts / members / candidate-changes`
4. `candidate-change` 与 `session` 绑定
5. `artifact_anchor / based_on_version_id / accepted_version_id`
6. `chat / prompt / model-router / rag` 真实接线
7. 第一轮结构性重构与目录收口

### 仍未完成的，不是“有没有”，而是“够不够产品级”

1. 资源域规则闭环仍需继续打磨
2. 生成链路稳态治理仍需补强
3. AI / Citation 共享语义仍需最终收口
4. PostgreSQL / 多机部署 / 运维 runbook 仍在准备阶段

---

## 4. 接下来真正该做的四大战役

## 战役 A：资源域闭环

目标：让 `project_space` 真正成为稳定的“库模型”，而不是一组接口集合。

涉及代码：

- `/Users/ln1/Projects/Spectra/backend/routers/project_space/`
- `/Users/ln1/Projects/Spectra/backend/services/project_space_service/`
- `/Users/ln1/Projects/Spectra/backend/services/database/project_space.py`
- `/Users/ln1/Projects/Spectra/backend/services/database/projects.py`

重点任务：

1. 压实 `reference` 规则
   - 主基底唯一
   - `follow / pinned` 行为一致
   - DAG 校验补强
   - `visibility / is_referenceable` 组合校验补强
2. 压实 `candidate-change -> review -> 新版本` 语义
3. 继续校验 `artifact / version / reference / review` 的完整链路
4. 为 `project-space` 补足更强的异常路径测试

完成标志：

- `Project` 相关语义在资源层内自洽
- review 合入后的版本与 artifact 锚点不会再漂
- `project_space` 可以作为长期沉淀本体看待

---

## 战役 B：生成域稳态化

目标：让 `session-first` 不是“能跑”，而是“能稳定跑、出问题能收住”。

涉及代码：

- `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/`
- `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/`
- `/Users/ln1/Projects/Spectra/backend/services/task_executor/`
- `/Users/ln1/Projects/Spectra/backend/services/preview_helpers/`
- `/Users/ln1/Projects/Spectra/backend/services/ai/`

重点任务：

1. 继续补强 task / worker / retry / timeout 稳态
2. 明确 outline / generation / export 各阶段的失败与恢复语义
3. 继续加强 session event、history、artifact binding 的回归保护
4. 让 preview / export / history 的结构和前端预期保持稳定

完成标志：

- worker 卡住时能快速诊断
- 失败态有统一 `error_code / state_reason`
- session 不再容易停留在模糊中间态

---

## 战役 C：AI / RAG / Citation 收口

目标：让 AI 能力链路既好扩展，也不继续制造语义漂移。

涉及代码：

- `/Users/ln1/Projects/Spectra/backend/routers/chat/`
- `/Users/ln1/Projects/Spectra/backend/services/ai/`
- `/Users/ln1/Projects/Spectra/backend/services/prompt_service/`
- `/Users/ln1/Projects/Spectra/backend/services/rag_api_service/`
- `/Users/ln1/Projects/Spectra/backend/services/rag_service/`

重点任务：

1. 统一 citation / rag payload / source reference 语义
2. 统一 route decision / observability 输出
3. 让 prompt 输入结构更稳定、更可组合
4. 继续补齐 degrade / fallback / quality baseline

完成标志：

- citation 结构稳定，不再靠上下文猜
- AI 路由选择和降级行为可解释
- chat / generation / rag 不再在共享字段上互相拉扯

---

## 战役 D：产品化底座

目标：让系统从“强工程原型”走向“可上线、可运维、可迁移”的形态。

涉及文档和代码：

- `/Users/ln1/Projects/Spectra/docs/postgres-migration-checklist.md`
- `/Users/ln1/Projects/Spectra/docs/deployment-topology.md`
- `/Users/ln1/Projects/Spectra/docs/runbook-main-deploy.md`
- `/Users/ln1/Projects/Spectra/docs/runbook-incident-response.md`
- `/Users/ln1/Projects/Spectra/backend/services/database/`
- `/Users/ln1/Projects/Spectra/backend/app_setup/`

重点任务：

1. PostgreSQL 迁移前置准备
2. 数据访问层规则进一步统一
3. 多机 Docker 部署拓扑落地
4. `main` 分支自动部署 / 健康检查 / 回滚流程
5. 配置一致性、内网通信、运维 runbook 继续补全

当前已开始落地：

- `/Users/ln1/Projects/Spectra/backend/scripts/deploy_smoke_check.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/deploy_preflight.py`
- `/Users/ln1/Projects/Spectra/docs/deployment-env-contract.md`
- `/Users/ln1/Projects/Spectra/backend/scripts/deploy_release_record.py`
- `/Users/ln1/Projects/Spectra/docs/release-records/README.md`
- `/Users/ln1/Projects/Spectra/backend/scripts/incident_record.py`
- `/Users/ln1/Projects/Spectra/docs/incident-records/README.md`
- `/Users/ln1/Projects/Spectra/backend/scripts/postgres_readiness_audit.py`
- `/Users/ln1/Projects/Spectra/backend/scripts/worker_queue_diagnose.py`

完成标志：

- 系统不再只适合本地演示
- 可以比较放心地上多机环境
- 迁 PostgreSQL 不会演变成全仓返工

---

## 5. 优先级建议

### P0：先做这些

1. 资源域闭环
2. 生成域稳态化
3. AI / Citation 收口中的共享语义部分

### P1：接着做这些

1. PostgreSQL 迁移准备
2. 部署 runbook
3. 自动部署与健康检查

### P2：再做这些

1. 兼容层最终退役
2. 冗余代码真正删除
3. serializer / assembler 层进一步系统化

---

## 6. 设计要求（继续推进时必须遵守）

后续实现必须继续符合下面这些原则：

1. 代码首先给人和 AI 看
2. 结构比技巧重要
3. 单一语义必须有单一来源
4. 共享契约必须先稳定再扩展
5. `Project / Session / Reference / Artifact / Version` 是系统本体，不得退化成零散功能
6. 优先让系统“可长期演进”，而不是“短期补完一个入口”

---

## 7. 当前建议

从现在开始，默认按下面的顺序继续：

1. 资源域闭环
2. 生成域稳态化
3. AI / Citation 收口
4. PostgreSQL / 部署前准备

这条顺序的理由很简单：

- 先把产品本体做稳
- 再把生成系统做稳
- 再把智能链路做稳
- 最后再去推部署和商业化底座

这样整个系统会更像一个真正的产品，而不是把部署工作压在语义还漂的系统上。
