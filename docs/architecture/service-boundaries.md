# Service Boundaries

> Status: `current`
> 更新时间：2026-04-16
> Role: canonical authority-boundary contract for the current system.

Spectra 主仓的目标形态是：

- frontend：界面、交互、状态展示
- backend：Session、会话状态机、任务编排、聚合响应、下载绑定
- external services：正式能力源

当前更准确的判断是：

- Spectra backend 已经是 `workflow shell / orchestration kernel / contract surface`
- 它不是传统 monolith
- 它也不是空心网关
- 它允许保留少量本地支撑器官，但这些器官不能重新长成第二套正式能力源

## 唯一正式能力源

| 能力 | 唯一正式服务 | Spectra 主仓职责 |
| --- | --- | --- |
| AI 课件/PPT 主生成 | `diego` | 建立 Session/run 绑定、同步事件、持久化最终 artifact |
| compile 执行、preview facade、PPT/DOC 外化 | `pagevra` | 优先消费 authority preview / artifact，必要时走 structured compatibility |
| project-space / artifact / version / reference 正式语义 | `ourograph` | 作为 consumer 调用，不在主仓内复制 formal-state 语义 |
| 上传编排与远端解析入口 | `dualweave` | 发起调用、记录状态、消费结果 |
| 检索与向量召回 | `stratumind` | 组织查询、设置 timeout、暴露 observability |
| 身份、会话、组织/成员身份容器 | `limora` | 作为 consumer 调用，不在主仓内保留第二套认证真相源 |

## Backend 允许保留的职责

- auth / permission / project ownership checks
- session / run / event lifecycle
- queue dispatch / worker observability
- artifact download binding and response shaping
- 对六个正式能力源的显式 client / adapter 封装
- 以 anti-corruption layer 方式做 payload translation、response normalization、local mirror 映射
- prompt building / AI routing policy / provider choice coordination

## Backend 本地器官分类

### kernel organs（明确保留）

这些属于 Spectra 作为 control plane 必须拥有的本地能力：

- Session / run / event / task orchestration
- API aggregation / artifact binding / download contract
- prompt building / AI routing policy / provider choice coordination
- local contract shaping around the six authority services

### transitional local auxiliaries（允许存在，但必须降级表述）

这些能力当前仍在母体里，但只能被视为过渡期本地辅助器官：

- `file_parser`：MVP local parser / compatibility parser
- `media/embedding`：provider glue + local embedding fallback guardrail
- `rag_api_service`：query assembly / response shaping；retrieval truth 仍归 `stratumind`
- `artifact_generator`：非 Office、本地动画/媒体类 helper
- 其他未外移的 enrichment / utility pipelines

### residual legacy organs（应继续清退或隔离）

这些不属于 Spectra 长期形态，只是历史或兼容残留：

- `generation/` 下继续膨胀的 compatibility 叙事
- `outline_draft` / old task-first 残影
- 仍让人误判为 backend 本地拥有正式 render / formal-state / identity / generation truth 的模块或文档
- 没有明确 owner 的 giant helper / transitional code dump

## Backend 不应继续承担的职责

- 用第二套本地实现替代微服务正式能力
- 为同一上游服务保留多套 env 命名和多套 adapter 语义
- 把 preview、download、task、artifact 混成一套产品语义
- 让 fallback 成为主链的真实定义
- 在 Spectra adapter 里重新长出上游服务的领域真相源

## 禁止新增的兼容层

- 同一能力多个入口名：例如一个服务同时叫 `PAGEVRA` / `STRUCTRA` / `RENDER_ENGINE`
- 旧 task-first 接口继续作为新功能入口
- backend-local Marp/Pandoc/office generator 重新成为 PPT/DOC 主链
- backend 默认把 Diego authority preview / artifact 重新翻译回 Pagevra structured `/render/*`
- 前端在同一个产品面板里混用两条不同真相源
- backend 在 formal state 上继续保留“本地也能替代远端”的产品路径

## 默认判断规则

如果一个改动让系统“能跑”，但代价是：

- 又多了一套能力名词
- 又多了一条 preview / render / state 分支
- 或者让 backend 重新变成能力实现者而不是编排者

那么这个改动默认是不合格的。
