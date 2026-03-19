# 冻结期重构 TODO

## 目的

在当前一代功能迭代稳定后，安排一个短周期“冻结开发窗口”，集中处理架构收口、去冗余、稳定性和部署基础问题。

目标不是推翻现有系统，而是：

- 为 PostgreSQL 迁移做准备
- 为 Docker 拆分 / K8s / 云部署做准备
- 提升稳定性、可维护性、可排障性
- 降低后续继续商业化演进时的结构阻力

---

## 当前基线

冻结期开始前，当前分支已经具备以下基础：

- `generate_sessions`、`chat`、`rag`、`files`、`projects`、`project_space` 已完成 package 化拆分
- `generation_session_service`、`project_space_service`、`task_executor`、`database`、`preview_helpers`、`rag_service`、`prompt_service`、`courseware_ai` 等已完成 folder-as-module 收口
- `PR93` 的核心后端语义已经迁入当前新结构：
  - session candidate-change
  - `artifact_anchor`
  - `latest_candidate_change`
  - project-space review payload / `accepted_version_id`
  - artifact normalize / metadata
- OpenAPI source / target 契约已经重新对齐
- `backend/scripts/check_generation_event_contract.py` 已扩展到目录级扫描
- `backend/scripts/architecture_guard.py` 已可用于冻结期持续自检

这意味着冻结期不是“从混乱状态开始重构”，而是：

- 在已经完成第一轮结构收口的基础上
- 继续做第二轮：去冗余、稳态治理、数据层准备、部署前整理

---

## 冻结前原则

1. 当前迭代内不再做大范围结构迁移
2. 新代码尽量遵守 `/Users/ln1/Projects/Spectra/docs/standards/backend.md`
3. 新增模块尽量按 `/Users/ln1/Projects/Spectra/backend/services/README.md` 的分区放置
4. 定期运行架构守门脚本：

```bash
python3 /Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py
```

5. 记录本轮迭代中最频繁改动、最容易出问题的模块，作为冻结期优先处理输入

---

## 冻结期执行清单

建议冻结期按下面的节奏推进，避免“所有事情一起上”：

### 第一阶段：先盘点，再动刀

1. 产出《冗余审计报告》
2. 产出《PostgreSQL 迁移风险清单》
3. 产出《部署拓扑草案（API / worker / redis / pg / chroma）》
4. 列出所有需要保留的兼容出口
5. 列出所有可以删除的旧路径、旧别名、旧 wrapper

### 第二阶段：先做最影响后续演进的事

1. 清理冗余与兼容层
2. 修外部模型调用超时和 worker 卡住问题
3. 梳理数据库访问层，为 PostgreSQL 做准备
4. 统一 service 分层和顶层拓扑

### 第三阶段：再做部署前准备

1. 明确 Docker 生产态结构
2. 明确多机部署内网通信方式
3. 明确日志、健康检查、故障恢复策略
4. 评估是否需要再进入下一轮“收口型重构”

---

## P0：冗余与结构收口

### 1. 冗余代码审计

目标：区分哪些代码可以删，哪些只是过渡兼容层。

输出建议：
- 可立即删除
- 可弃用保留
- 暂时保留

重点排查：
- 未被引用代码
- 纯转发 wrapper
- 重复 helper
- 旧导出别名
- 过期脚本
- 过期 README / 文档残留

冻结期产物：
- `docs/redundancy-audit.md`
- 按 `可立即删除 / 可弃用保留 / 暂时保留` 三类列出清单

### 2. 清理兼容层

重点关注：
- `/Users/ln1/Projects/Spectra/backend/services/__init__.py`
- 各模块 `__init__.py` 中历史兼容出口
- 测试不再依赖的 monkeypatch wrapper

目标：
- 保留必要兼容
- 清理无意义兼容
- 减少“看似还能用、实际上不该再用”的旧路径

建议优先关注：
- 兼容导出是否仍被生产代码引用
- 是否只剩测试 monkeypatch 依赖
- 是否已经有更明确的新入口可替代

### 3. 继续统一模块边界

目标边界：
- `router -> application service -> domain/data`

重点动作：
- 继续减少生产代码中的 `from services import xxx`
- 清理 router 中残余的业务编排
- 收紧 service 对 HTTP 语义的泄漏

冻结期完成标准：
- 新增代码不再依赖根级兼容入口
- router 中不再新增复杂业务编排
- service 对响应格式拼装的职责边界更清楚

---

## P1：稳定性与外部依赖治理

### 4. 给外部模型调用加超时保护

重点文件：
- `/Users/ln1/Projects/Spectra/backend/services/ai/service.py`

目标：
- 给 `acompletion()` 增加显式 timeout
- provider 卡住时不要让任务无限挂起
- 明确日志中区分 timeout / provider failure / fallback failure

建议输出：
- timeout 策略表
- provider 异常分级说明

### 5. 任务状态收敛

重点关注：
- outline draft
- generation task
- queue / worker 状态回写

目标：
- 外部调用超时时明确落失败态或 fallback 态
- session 不要长期停留在 `DRAFTING_OUTLINE` / `PROCESSING`
- worker 重启后能更容易恢复或清理卡住任务

建议输出：
- 会话状态机异常路径清单
- queue stuck / retry / failover 处理表

### 6. 配置与 Docker 环境一致性检查

重点关注：
- `.env` 在本地 / Docker / worker / backend 中是否一致
- provider 配置是否在容器内正确生效
- 外部网络调用在容器内是否稳定

目标：
- 降低“本地正常、Docker 偶发卡住”的情况

---

## P1：数据层与 PostgreSQL 准备

### 7. 审查数据库访问层

目标：
- 统一 Prisma/DB 调用方式
- 减少散落的数据库访问假设
- 为后续迁移 PostgreSQL 做准备

重点检查：
- SQLite 特有行为依赖
- 分页与排序假设
- 大小写敏感差异
- 唯一约束与事务边界
- JSON / 时间 / 默认值相关用法

冻结期产物：
- `docs/postgres-migration-checklist.md`

### 8. 制定 PostgreSQL 迁移清单

输出建议：
- 模型兼容性清单
- 风险点清单
- 迁移顺序
- 验证脚本 / 回归检查项

---

## P1：服务拓扑与分层统一

### 9. 继续完善 service 顶层分区

当前方向：
- `application`
- `generation`
- `media`
- `platform`

目标：
- 减少 `/Users/ln1/Projects/Spectra/backend/services/` 顶层继续横向膨胀
- 让领域结构比文件名更有表达力

冻结期建议优先次序：
1. `generation`
2. `application`
3. `platform`
4. `media`（主要做细修，不再大搬）

### 10. 统一 service package 规范

内容包括：
- 命名方式统一
- `__init__.py` 对外导出规范
- 哪些属于 application service
- 哪些属于 domain helper/service

### 11. 评估 serializer / assembler 层

目标：
- 逐步把复杂 response payload 组装从 service 中再抽一层
- 降低接口字段变动时的改动面

优先候选：
- `rag`
- `project_space`
- `preview`
- `files`

---

## P2：部署与云化准备

### 12. Docker 结构继续优化

目标：
- 明确 API / worker / redis / chroma 的职责边界
- 优化镜像分层与缓存
- 为多环境部署打基础

建议输出：
- `docs/deployment-topology.md`
- `docs/runbook-main-deploy.md`

### 13. 为 K8s 做前置准备

关注点：
- config / env 管理
- readiness / liveness
- volume 需求
- worker 扩缩容边界
- 健康检查与启动顺序

### 14. 可观测性补强

目标：
- 更清楚区分 provider error / timeout / queue stuck / db error
- 强化 request / task / session 关联日志
- 为未来线上排障做准备

---

## P2：治理与守门

### 15. 将架构守门纳入日常流程

文件：
- `/Users/ln1/Projects/Spectra/backend/scripts/architecture_guard.py`

建议：
- 接入常用检查流程或 CI
- 让结构问题在新增代码时就能被提醒

### 16. 增补规则

建议规则：
- 禁止新增顶层平铺 `*_service.py`
- 禁止新生产代码随意 `from services import xxx`
- 大文件分级预警
- 新模块默认优先采用 `folder-as-module`

---

## 建议执行顺序

1. 冗余代码审计
2. 外部调用 timeout / worker 稳定性
3. 数据层整理，为 PostgreSQL 铺路
4. service 拓扑与分层统一
5. Docker / K8s 前置准备
6. 守门规则与 CI 接入

---

## 战役拆分建议

如果冻结期按周推进，建议拆成：

### Week 1
- 冗余审计
- 兼容层清理
- timeout / stuck task 治理

### Week 2
- 数据层整理
- PostgreSQL 风险清单
- service 拓扑统一

### Week 3
- Docker / 多机部署准备
- 运维 runbook
- guard / CI / 文档补齐

---

## 完成标准

冻结期结束时，希望达到：

- 大部分可删冗余已清理
- 外部调用卡住不再导致任务无限悬挂
- PostgreSQL 迁移风险已明确可执行
- service 拓扑更稳定，不再继续无序膨胀
- Docker / 云部署前置条件更清楚
- 架构守门规则能够持续约束后续开发
