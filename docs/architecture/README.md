# 架构文档说明

> 更新时间：2026-03-21
> Status: active

## 当前推荐阅读顺序

1. [Project Philosophy (Canonical)](../project/SYSTEM_PHILOSOPHY_2026-03-19.md)
2. [技术栈](./tech-stack.md)
3. [系统总览](./system/overview.md)
4. [后端架构](./backend/overview.md)
5. [前端架构](./frontend/overview.md)
6. [API 契约](./api-contract.md)
7. [部署说明](./deployment.md)

## 文档定位

- `tech-stack.md`：当前技术栈与运行依赖入口
- `system/`：跨前后端系统结构
- `backend/`、`frontend/`：当前实现分层与目录责任
- `api-contract.md`：接口与运行契约说明
- `deployment*`：本地、容器、生产部署说明

历史 project-space 演进草案已经移至：

- [../archived/project-space/](../archived/project-space/)

它们保留历史价值，但不再是默认实现依据。

## 维护要求

- 架构文档描述“当前实现”时，必须能在代码中定位。
- 未实现能力必须明确标注，不得写成已落地事实。
- 若与代码冲突，以代码和当前测试结果为准，并同步修正文档。
