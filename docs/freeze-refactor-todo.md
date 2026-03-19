# 冻结期重构 TODO

## 目的

在当前一代功能迭代稳定后，安排一个短周期“冻结开发窗口”，集中处理架构收口、去冗余、稳定性和部署基础问题。

目标不是推翻现有系统，而是：

- 为 PostgreSQL 迁移做准备
- 为 Docker 拆分 / K8s / 云部署做准备
- 提升稳定性、可维护性、可排障性
- 降低后续继续商业化演进时的结构阻力

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

### 2. 清理兼容层

重点关注：
- `/Users/ln1/Projects/Spectra/backend/services/__init__.py`
- 各模块 `__init__.py` 中历史兼容出口
- 测试不再依赖的 monkeypatch wrapper

目标：
- 保留必要兼容
- 清理无意义兼容
- 减少“看似还能用、实际上不该再用”的旧路径

### 3. 继续统一模块边界

目标边界：
- `router -> application service -> domain/data`

重点动作：
- 继续减少生产代码中的 `from services import xxx`
- 清理 router 中残余的业务编排
- 收紧 service 对 HTTP 语义的泄漏

---

## P1：稳定性与外部依赖治理

### 4. 给外部模型调用加超时保护

重点文件：
- `/Users/ln1/Projects/Spectra/backend/services/ai/service.py`

目标：
- 给 `acompletion()` 增加显式 timeout
- provider 卡住时不要让任务无限挂起
- 明确日志中区分 timeout / provider failure / fallback failure

### 5. 任务状态收敛

重点关注：
- outline draft
- generation task
- queue / worker 状态回写

目标：
- 外部调用超时时明确落失败态或 fallback 态
- session 不要长期停留在 `DRAFTING_OUTLINE` / `PROCESSING`
- worker 重启后能更容易恢复或清理卡住任务

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

## 完成标准

冻结期结束时，希望达到：

- 大部分可删冗余已清理
- 外部调用卡住不再导致任务无限悬挂
- PostgreSQL 迁移风险已明确可执行
- service 拓扑更稳定，不再继续无序膨胀
- Docker / 云部署前置条件更清楚
- 架构守门规则能够持续约束后续开发
