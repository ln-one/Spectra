# 新人入职指南

> 更新时间：2026-03-02
> 本文档只保留新人上手流程，不重复 `getting-started.md` 的安装细节。

## 1. 首日必做

- 阅读 [CONTRIBUTING](../CONTRIBUTING.md)
- 阅读 [技术栈（MVP 对齐版）](../architecture/tech-stack.md)
- 按 [Getting Started](./getting-started.md) 完成本地启动

## 2. 提交前检查

- 前端：`cd frontend && npm run lint && npm test`
- 后端：`cd backend && pytest`
- OpenAPI：如接口变更，执行 `npm run sync:openapi`

## 3. 文档协作规范

- 文档写“已落地”时，必须能映射到代码路径。
- 规划中的能力必须标注为“规划中/未接入”。
- 新增技术方案先补 ADR，再改实现。

## 4. 常见坑位

- 不要把历史阶段文档当作当前实现依据。
- 不要在多个文档重复维护同一份技术栈信息。
- 技术栈以 [architecture/tech-stack.md](../architecture/tech-stack.md) 为准。
