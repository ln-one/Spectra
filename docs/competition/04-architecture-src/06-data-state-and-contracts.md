# 06. 数据与状态设计、运行拓扑与契约总览

## 本节要解释的系统问题

为什么 `Spectra` 的详细设计不能只停留在“总架构 + 六服务边界”，而必须把数据/状态、运行拓扑和关键契约显式写出来。

## 产品本体位置

- 数据与状态设计解释课程知识空间如何从工作过程上升为正式系统
- 运行拓扑解释系统为什么已经具备真实协作现实
- 契约总览解释前端工作台、控制平面与正式能力层如何稳定连接

## 当前真实实现如何支撑

- `backend/prisma/schema.postgres.prisma` 已存在控制平面过程态对象，如 `GenerationSession`、`SessionEvent`、`Upload`、`ParsedChunk`
- `ourograph` 自有 PostgreSQL migration，已承接 `project / project_version / project_reference / artifact / candidate_change / project_member`
- `limora` 自有 Prisma schema，已承接 `User / Session / Organization / Membership / AuditEvent`
- `stratumind` 与 `qdrant` 构成检索与证据状态底座
- `docker-compose.yml` 已形成 frontend / backend / worker / store / six-authority 的真实运行拓扑

## 可证明事实

- 数据库设计当前已是多 store、多 authority 的状态结构，而不是单库单真相源
- 正式知识状态、身份状态、过程态和检索态已经在代码上分层
- 前端工作台、控制平面和正式能力层之间已经形成稳定契约分布

## 本节图

- 图 4-5：数据与状态设计（数据库设计）图
- 图 4-6：关键接口与契约总览图
- 图 4-7：当前运行拓扑图

## 边界

- 不把数据库设计写成字段字典
- 不把运行拓扑写成运维手册
- 不把契约总览写成 OpenAPI 参数表
- 只回答系统如何成立，不抢第 5/6/8 章的层级
