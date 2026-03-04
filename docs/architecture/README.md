# 架构文档说明

> 更新时间：2026-03-02

## 当前推荐阅读顺序

1. [技术栈（MVP 对齐版）](./tech-stack.md)
2. [契约优先架构调整说明](./contract-first-adjustment.md)
3. [系统总览](./system/overview.md)
4. [前端架构](./frontend/overview.md)
5. [后端架构](./backend/overview.md)
6. [部署说明](./deployment.md)

## 文档定位

- `tech-stack.md`：当前实现与过渡路线（最权威入口）。
- `system/`：跨前后端系统视角。
- `frontend/`、`backend/`：分层设计与实现细节。
- `deployment*`：本地与生产部署要点。

## 维护要求

- 架构文档描述“当前实现”时，必须能在代码中定位。
- 未实现能力统一标注为“规划中”，并给出迁移阶段。
- 若与代码冲突，以代码为准并立即修正文档。
