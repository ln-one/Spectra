# 架构文档说明

> 更新时间：2026-03-12

## 当前推荐阅读顺序

1. [Project Philosophy (Canonical)](../project/SYSTEM_PHILOSOPHY_2026-03-19.md)
2. [技术栈（MVP 对齐版）](./tech-stack.md)
3. [系统总览](./system/overview.md)
4. [API 契约](./api-contract.md)
5. [前端架构](./frontend/overview.md)
6. [后端架构](./backend/overview.md)
7. [部署说明](./deployment.md)
8. [Project-Space 演进索引（2026-03-09）](../project/SPACE_MODEL_INDEX_2026-03-09.md)

## 文档定位

- `tech-stack.md`：当前实现与过渡路线（最权威入口）。
- `system/`：跨前后端系统视角。
- `frontend/`、`backend/`：分层设计与实现细节。
- `deployment*`：本地与生产部署要点。
- `docs/project/*_2026-03-09.md`：下一阶段的 Project-Space 演进主线（模型、API、数据草案）。

## 维护要求

- 架构文档描述“当前实现”时，必须能在代码中定位。
- 未实现能力统一标注为“规划中”，并给出迁移阶段。
- 若与代码冲突，以代码为准并立即修正文档。
