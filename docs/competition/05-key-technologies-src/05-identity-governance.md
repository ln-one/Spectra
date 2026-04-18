# 05. 身份、组织与长期协作边界

## 要解决的业务问题

如果身份、组织、成员语义长期混在主仓里，系统一旦扩展到学校、教研组或机构场景，就会出现工作流本体被治理逻辑污染的问题。

## 对应的产品能力与外化结果

- identity
- login session
- organization
- member boundary
- 面向教师、学生、学校/机构的长期协作基础

## 采用的微服务与关键技术

- `Limora`：identity / session / organization membership authority
- `Spectra Backend`：作为 consumer 调用，不保留第二套身份真相源

## 核心机制与实现路径

当前实现锚点：

- [backend/services/identity_service/](/Users/ln1/Projects/Spectra/backend/services/identity_service)
- [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)

## 当前代码/测试/产品面可以证明的现实

- `Limora` 已被明确定义为 formal identity / organization authority
- Spectra 内部身份模块已被降级为 local mirror/helper 语义

可用测试锚点：

- [backend/tests/services/test_auth_service.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_auth_service.py)

## 本节 Mermaid 图

- 图 5-7：身份与组织边界图
- 重点表达：`Limora` 承担身份、登录会话、组织和成员 authority；`Spectra Backend` 只消费边界并用于课程知识空间工作流。

## 本节写作禁区与披露边界

- 不把身份治理写得压过课程知识空间本体
- 不把 `Limora` 写成简单登录模块
