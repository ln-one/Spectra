# 功能需求（精简版）

> 更新时间：2026-03-02

## 输出文件

- [功能清单](./feature-list.md)
- [系统边界](./system-boundary.md)
- [API 规划](./api-planning.md)
- [迭代计划](./iteration-plan.md)

## MVP 功能闭环

`项目创建 -> 对话输入 -> 文件上传 -> RAG 召回 -> 生成 -> 预览修改 -> 导出`

## 结构化范围

| 优先级 | 范围 | 说明 |
|---|---|---|
| P0 | F01-F12 | MVP 必做 |
| P1 | F13-F16 | 体验增强 |
| P2 | F17-F19 | 协作与复用 |

## 约束

- API 口径以 OpenAPI 与后端路由实现为准。
- 功能文档不重复维护技术栈表格。
- 规划能力须显式标注，不可写成“已实现”。

## 关联文档

- [用户体验需求](../ux/README.md)
- [AI 能力需求](../ai/README.md)
- [技术栈（MVP 对齐版）](../../architecture/tech-stack.md)
