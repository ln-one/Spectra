# Spectra 文档中心

> 更新时间：2026-03-19
> 目标：入口清晰、状态明确、与代码一致。

## 1. 核心入口

- [贡献规范](./CONTRIBUTING.md)
- [架构理念（项目哲学）](./architecture/PHILOSOPHY.md)
- [技术栈（MVP 对齐版）](./architecture/tech-stack.md)
- [系统总览](./architecture/system/overview.md)
- [OpenAPI 文档](./openapi/README.md)

## 2. 架构与决策

- [架构目录说明](./architecture/README.md)
- [技术决策 ADR](./decisions/README.md)

## 3. 工程与协作

- [开发指南](./guides/README.md)
- [工程规范](./standards/README.md)
- [冻结期重构 TODO](./freeze-refactor-todo.md)
- [剩余工作战役清单](./remaining-work-battle-plan.md)
- [冗余审计报告](./redundancy-audit.md)
- [Legacy Surface Map](./legacy-surface-map.md)
- [Legacy Interface Retirement Plan](./legacy-interface-retirement-plan.md)
- `backend/scripts/compat_surface_audit.py` - 扫描剩余兼容层导入面
- [PostgreSQL 迁移检查清单](./postgres-migration-checklist.md)
- [部署拓扑草案](./deployment-topology.md)
- [部署环境变量契约](./deployment-env-contract.md)
- [Main 分支部署 Runbook](./runbook-main-deploy.md)
- [故障响应 Runbook](./runbook-incident-response.md)
- `backend/scripts/deploy_preflight.py` - 发布前环境与网络预检
- `backend/scripts/deploy_smoke_check.py` - 发布后基础链路 smoke check
- `backend/scripts/deploy_release_record.py` - 生成 main 发布记录骨架
- `backend/scripts/incident_record.py` - 生成故障复盘记录骨架
- `backend/scripts/postgres_readiness_audit.py` - 输出 PostgreSQL 迁移前的模型与一致性风险快照
- `backend/scripts/worker_queue_diagnose.py` - 快速诊断 worker / queue / stuck job 状态
- [故障记录目录](./incident-records/README.md)
- [发布记录目录](./release-records/README.md)

## 4. 规划与比赛

- [当前阶段计划（2026-03-09）](./project/PROJECT_SPACE_API_DRAFT_2026-03-09.md)
- [系统哲学（2026-03-19）](./project/SYSTEM_PHILOSOPHY_2026-03-19.md)
- [项目原始需求](./project/requirements.md)
- [比赛材料](./competition/)

## 5. 归档文档

- [历史归档（不维护）](./archived/)

## 6. 文档状态定义

- `已落地`：代码中已实现。
- `规划中`：有方案但未接入主流程。
- `历史文档`：保留背景，不作为当前实现依据。
