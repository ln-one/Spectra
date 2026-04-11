# Service Boundaries

> 更新时间：2026-04-11
> 状态：当前生效

Spectra 主仓的目标形态是：

- frontend：界面、交互、状态展示
- backend：鉴权、会话状态机、任务编排、聚合响应
- external services：正式能力源

## 唯一正式能力源

| 能力 | 唯一正式服务 | Spectra 主仓职责 |
| --- | --- | --- |
| 上传编排与远端解析入口 | `dualweave` | 发起调用、记录状态、消费结果 |
| 检索与向量召回 | `stratumind` | 组织查询、设置 timeout、暴露 observability |
| 结构化渲染、预览、PPT/DOC 输出 | `pagevra` | 构造 render input、绑定 artifact、展示 preview |
| project-space / artifact / version / reference 正式语义 | `ourograph` | 作为 consumer 调用，不在主仓内复制 formal-state 语义 |

## Backend 允许保留的职责

- auth / permission / project ownership checks
- session / run / event lifecycle
- queue dispatch / worker observability
- artifact download binding and response shaping
- 对四个微服务的显式 client / adapter 封装

## Backend 不应继续承担的职责

- 用第二套本地实现替代微服务正式能力
- 为同一上游服务保留多套 env 命名和多套 adapter 语义
- 把 preview、download、task、artifact 混成一套产品语义
- 让 fallback 成为主链的真实定义

## 禁止新增的兼容层

- 同一能力多个入口名：例如一个服务同时叫 `PAGEVRA` / `STRUCTRA` / `RENDER_ENGINE`
- 旧 task-first 接口继续作为新功能入口
- 前端在同一个产品面板里混用两条不同真相源
- backend 在 formal state 上继续保留“本地也能替代远端”的产品路径

## 默认判断规则

如果一个改动让系统“能跑”，但代价是：

- 又多了一套能力名词
- 又多了一条 preview / render / state 分支
- 或者让 backend 重新变成能力实现者而不是编排者

那么这个改动默认是不合格的。
