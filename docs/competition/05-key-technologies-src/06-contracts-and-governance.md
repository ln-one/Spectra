# 06. 契约实现、数据回流与权限治理

## 要解决的业务问题

为什么第 5 章不能只讲服务名和机制名，而必须把关键接口契约、数据回流和权限治理显式写成实现视图。

## 对应的产品能力与外化结果

- `Session` 编排与事件推进
- preview / refine / history / download 正式结果契约
- artifact / candidate change / version 回流契约
- identity / organization / membership 边界
- 课程空间权限与组织级交付基础

## 采用的微服务与关键技术

- `Spectra Backend`：控制平面契约与结果整形
- `Diego`：generation contract
- `Pagevra`：preview / render / export contract
- `Ourograph`：formal bind / version / reference / member contract
- `Stratumind`：evidence contract
- `Limora`：identity / organization / membership contract

## 核心机制与实现路径

当前实现锚点：

- [backend/prisma/schema.postgres.prisma](/Users/ln1/Projects/Spectra/backend/prisma/schema.postgres.prisma)
- [backend/services/identity_service/](/Users/ln1/Projects/Spectra/backend/services/identity_service)
- [backend/services/stratumind_client.py](/Users/ln1/Projects/Spectra/backend/services/stratumind_client.py)
- [backend/services/render_engine_adapter.py](/Users/ln1/Projects/Spectra/backend/services/render_engine_adapter.py)
- [ourograph/src/main/resources/db/migration/V1__create_ourograph_tables.sql](/Users/ln1/Projects/Spectra/ourograph/src/main/resources/db/migration/V1__create_ourograph_tables.sql)
- [limora/prisma/schema.prisma](/Users/ln1/Projects/Spectra/limora/prisma/schema.prisma)

## 当前代码/测试/产品面可以证明的现实

- 过程态、正式态、身份态和检索态已在不同 authority 中分层
- preview / export / bind 已形成稳定结果契约
- `Limora` 已承接正式 identity / organization authority
- `Ourograph` 已承接正式 project-space / version / reference / member 语义

## 本节 Mermaid 图

- 图 5-6：关键接口与契约实现图
- 图 5-8：权限、身份与组织治理图

## 本节写作禁区与披露边界

- 不把契约实现写成 OpenAPI 参数表
- 不把权限治理写成后台管理功能说明
- 不让 `Limora` 抢走课程知识空间本体层级
