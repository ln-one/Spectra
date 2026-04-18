# 01. 系统本体与设计原则

## 本节要解释的系统问题

为什么 `Spectra` 必须被写成课程知识空间系统，而不是课件功能集合或服务堆叠图。

## 产品本体位置

- 系统本体是课程知识空间
- 文件是按需外化结果
- 过程态与正式态必须分离

## 当前真实实现如何支撑

- 主章对象语言已经稳定为 `Project / Session / Artifact / Version / Reference / CandidateChange / Member`
- 第 3 章需求论证和第 5 章知识状态技术组都以这套对象语言为骨架
- `Ourograph` 已经被写成 formal knowledge-state core，`Spectra` 只作为 consumer / control plane

## 可证明事实

- canonical docs 已固定课程知识空间与 formal-state 口径
- 第 4 章对象关系图与第 5 章知识状态图必须保持一致

## 本节图

- 图 4-1 总体分层架构图
- 图 4-4 知识空间对象关系图

## 边界

- 不展开 `Ourograph` 内部 formal kernel 细则
- 不抢第 5 章知识状态机制细节
