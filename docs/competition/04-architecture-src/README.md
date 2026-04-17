# 第 4 章源稿目录

> Status: `current`
> Role: internal source pack for `04-architecture.md`.

本目录不是对外主稿，而是第 4 章“系统设计”的内部源稿。对外阅读仍以 `04-architecture.md` 为准，本目录负责深写系统本体、产品面、控制平面、主链、运行现实和图示归属，避免第 4 章再次退化成一个松散的大文件。

## 使用规则

- 对外主章必须保持系统设计章口气，不能写成服务清单或内部备忘录。
- 本目录负责 truth-check、代码锚点、前端产品面锚点、图示归属和细化判断。
- 第 4 章以 `知识空间 + Studio + 主链闭环 + 控制平面` 为第一主角，六个正式能力层作为支撑层自然落位。
- 第 4 章只讲系统层判断，不重复第 5 章的实现细节、第 6 章的指标表和第 8 章的商业飞轮。
- Mermaid 图应由源稿先定义，再汇总进主章；不要只在主章里临时拼图。

## 当前拆分

1. [01-system-body-and-principles.md](./01-system-body-and-principles.md)
2. [02-product-surface-and-studio.md](./02-product-surface-and-studio.md)
3. [03-control-plane-and-authorities.md](./03-control-plane-and-authorities.md)
4. [04-core-workflows.md](./04-core-workflows.md)
5. [05-runtime-topology-and-delivery.md](./05-runtime-topology-and-delivery.md)
6. [06-data-state-and-contracts.md](./06-data-state-and-contracts.md)

## 图示归属

- 图 4-1 总体分层架构图：`01-system-body-and-principles.md` + `03-control-plane-and-authorities.md`
- 图 4-2 Studio 产品面与多模态外化图：`02-product-surface-and-studio.md`
- 图 4-3 Session 主链闭环图：`04-core-workflows.md`
- 图 4-4 知识空间对象关系图：`01-system-body-and-principles.md`
- 图 4-5 数据与状态设计（数据库设计）图：`06-data-state-and-contracts.md`
- 图 4-6 关键接口与契约总览图：`06-data-state-and-contracts.md`
- 图 4-7 当前运行拓扑图：`05-runtime-topology-and-delivery.md` + `06-data-state-and-contracts.md`

## 内部统一模板

每个源稿至少回答：

1. 本节要解释的系统问题
2. 这部分在产品本体中的位置
3. 当前真实实现如何支撑它
4. 哪些前端、后端或架构事实可以证明它成立
5. 本节图应该怎么画
6. 哪些细节不应抢到第 5/6/8 章里展开

## 当前 truth-check 锚点

- 前端产品面：
  - [frontend/components/project/features/studio/StudioPanel.tsx](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/StudioPanel.tsx)
  - [frontend/components/project/features/studio/panel/constants.ts](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/panel/constants.ts)
  - [frontend/components/project/features/studio/panel/useStudioCapabilityState.ts](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/panel/useStudioCapabilityState.ts)
- canonical 架构语义：
  - [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)
  - [docs/architecture/system/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/system/overview.md)
  - [docs/architecture/backend/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md)
- 课程知识空间对象语言：
  - [docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md](/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md)
  - [docs/archived/project-space/SPACE_MODEL_INDEX_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/SPACE_MODEL_INDEX_2026-03-09.md)
