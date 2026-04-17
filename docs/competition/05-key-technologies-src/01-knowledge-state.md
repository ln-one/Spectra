# 01. 知识空间本体与正式状态管理

## 要解决的业务问题

如果系统只会生成 PPT、教案或其他文件，却没有正式状态语言，那么所有结果都会退化为“一次性导出物”。这会导致：

- 课程资产无法长期沉淀
- 修改历史缺少正式锚点
- 不同成果之间难以形成可追踪关系
- 一门课无法真正演化成课程数据库

## 对应的产品能力与外化结果

本组能力支撑以下产品语义：

- `Project` 作为课程知识空间
- `Session` 作为局部工作展开
- `Artifact` 作为按需外化结果
- `Version` 作为正式状态锚点
- `Reference` 作为跨空间引用关系
- `CandidateChange` 作为演化入口
- `Member` 作为协作边界语义

## 采用的微服务与关键技术

- `Ourograph`：formal knowledge-state authority
- `Spectra Backend`：consumer + orchestration shell
- project-space ontology：库、引用、版本、候选变更、外化结果之间的关系语言

## 核心机制与实现路径

写作时应始终强调：

- 系统本体不是导出文件，而是库与引用关系
- `Artifact` 通过 `Version`、`CandidateChange` 和 `Reference` 回到正式状态体系
- `Spectra` 不复制 formal-state truth，而是通过 client/facade 使用 `Ourograph`

当前实现锚点：

- [backend/services/ourograph_client.py](/Users/ln1/Projects/Spectra/backend/services/ourograph_client.py)
- [backend/services/ourograph_client_support/commands.py](/Users/ln1/Projects/Spectra/backend/services/ourograph_client_support/commands.py)
- [backend/services/ourograph_client_support/queries.py](/Users/ln1/Projects/Spectra/backend/services/ourograph_client_support/queries.py)
- [backend/services/project_space_service/artifact_rendering.py](/Users/ln1/Projects/Spectra/backend/services/project_space_service/artifact_rendering.py)

语义锚点：

- [docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_DATA_MODEL_DRAFT_2026-03-09.md)
- [docs/archived/project-space/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md](/Users/ln1/Projects/Spectra/docs/archived/project-space/PROJECT_SPACE_EVOLUTION_DESIGN_2026-03-09.md)

## 当前代码/测试/产品面可以证明的现实

- `Ourograph` 已被明确定位为 formal state authority，而不是 Spectra 内部一个 helper
- 第 5 章中涉及的对象语言已经能和当前 runtime reality 对齐
- 项目中的 artifact/rendering/bind 语义已经围绕远端 authority 收口

测试锚点：

- [backend/tests/services/test_ourograph_client.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_ourograph_client.py)
- [backend/tests/services/test_project_space_service_artifacts.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_project_space_service_artifacts.py)

## 本节 Mermaid 图

- 图 5-2：知识状态与版本演化图
- 图中必须出现：
  - `Project`
  - `Artifact`
  - `Version`
  - `Reference`
  - `CandidateChange`
  - `Member`

## 本节写作禁区与披露边界

- 不把 `Spectra` 写成知识状态 owner
- 不展开可直接复刻 `Ourograph` formal kernel 的内部规则
- 不把 ontology 写成“只是一套数据库表”
