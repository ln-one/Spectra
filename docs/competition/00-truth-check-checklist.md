# Spectra 商业方案书 Truth-Check 清单

> Status: `current`
> Role: internal verification checklist for commercial-proposal drafting.

## 1. Purpose

商业方案书不能只信旧文档，也不能只靠漂亮叙事。

在以下情况，必须回到代码、测试、正式报告和当前服务现实核对：

- 章节涉及系统边界；
- 章节涉及主链流程；
- 章节涉及“系统已经做成了什么”；
- 章节涉及六个正式能力层分工；
- 章节涉及关键技术、测试结果或商业承诺。

## 2. Truth Source Order

写商业方案书时，优先按以下顺序核对事实：

1. live code、focused passing tests、current service behavior；
2. latest formal benchmark / report files；
3. Spectra canonical docs；
4. six microservice README / docs / current implementation；
5. `docs/project/*` 的哲学、需求和产品来源；
6. `docs/archived/project-space/*` ontology references；
7. old `docs_output/Spectra.docx` and other historical drafts。

补充规则：

- `docs/project/*` 中的旧质量结论、阶段性总结、实验口径，默认不进入主展示结论；
- 对外主稿中的性能与质量数字，必须优先来自最新正式 benchmark / report；
- `Stratumind` 主展示数据默认使用 `promoted60_*`、`promoted105_*`；
- 更早的 showcase / gold-dataset 实验稿只允许作为补充技术深度材料；
- `Dualweave` 没有正式最新场景报告前，只写评估方法、工程维度和可观测指标，不写具体提升倍数。

## 3. Chapter-Level Questions

每个核心章节起稿前，先回答：

1. 这一章最关键的 5 到 10 个事实是什么？
2. 它们是否与当前代码、当前测试、当前服务 reality 一致？
3. 有没有“写得很像样但已经过时”的旧段落或旧图？
4. 哪些结论需要代码现实、测试现实或正式 benchmark 兜底？
5. 这一章有没有把 `Spectra` 写成大一统后端？
6. 这一章有没有把过时链路写成当前主链？
7. 这一章有没有把旧阶段数据写成当前主展示成绩？
8. 这一章离开仓库后能否独立成立？

## 4. Core Chapter Focus

### 4.1 `01-overview`

必须对齐：

- `Spectra` = knowledge space system + Studio + workflow shell；
- six services = formal capability authorities；
- 系统已经做成了什么，而不是只写愿景。

### 4.2 `03-requirements-analysis`

必须对齐：

- 用户对象、业务痛点、系统能力和验收标准；
- `docs/project/requirements.md` 中的核心需求；
- 需求能落到当前产品面和当前能力层。

### 4.3 `04-architecture`

必须对齐：

- current compose / local-source service reality；
- frontend Studio cards and preview contract；
- backend generate session / project-space / authority client architecture；
- `Spectra` 与 `Ourograph` 的 consumer / authority 关系。

### 4.4 `05-key-technologies`

必须对齐：

- “为实现 xx 功能，采用 xx 技术”的写法；
- Mermaid 图和正文互相解释；
- 第 5 章只放机制和结论级证据，不堆完整 benchmark 表。

### 4.5 `06-testing-evaluation`

必须对齐：

- 第 6 章是测试证据主场；
- `Stratumind` 完整正式集、baseline、指标解释和结果表在本章展开；
- `Dualweave` 只写可披露评估维度和正式报告边界；
- 所有关键结果必须能在正文内自闭环。

### 4.6 `08-business-plan`

必须对齐：

- 客户分层；
- 交付形态；
- 收入结构；
- 市场进入路径；
- 为什么客户愿意购买。

## 5. Red Flags

看到以下现象时，应立即回查代码/文档：

- 把 `GenerationTask` 写成当前产品主模型；
- 把 `Spectra` 写成知识库 owner；
- 把旧 generation/render/formal-state 说成 backend 本地 authority；
- 把旧阶段 benchmark / 质量总结写成当前正式成绩；
- 把 `Dualweave` 或 `Ourograph` 写得细到可直接复刻；
- 只有技术名词，没有对应功能问题；
- 只有宏大叙事，没有真实结果和证据；
- 正文依赖仓库路径、README、测试文件或源码跳转才能成立。

## 6. Drafting Rule

若文档与代码冲突：

- 默认优先写当前真实系统；
- 若代码是明显过渡残余而 canonical docs 与主链现实已经明确，则按当前 target-state 写，但不能传播旧主链幻觉；
- 若涉及商业承诺或性能数字，宁可克制，也不要把未经治理的数据写成正式结论。
