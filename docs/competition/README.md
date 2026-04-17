# Commercial Proposal Docs

> Status: `current`
> Role: Markdown-first production surface for the Spectra commercial proposal.

## 定位

本目录存放 `Spectra` 对外商业方案书的 Markdown 主稿、附录与内部维护文件。

这里是正式商业方案书的**生产面**，不是旧 `docx` 的修修补补层，也不是仓库内技术说明书。

当前主叙事已经统一为：

`库是系统本体 -> 课程数据库是长期沉淀对象 -> 多模态内容是按需外化结果 -> 引用关系形成课程知识网络`

同时必须保持当前现实：

- `Spectra` = workflow shell / orchestration kernel / contract surface
- 六个微服务 = formal capability authorities
- `Ourograph` = formal knowledge-state core；`Spectra` 只是 consumer

## 工作流

采用 `Markdown-first, DOCX-second`：

1. 在 `docs/competition/*` 中完成章节重写和图文结构
2. 通过 truth-check 校验关键事实
3. Markdown 主稿稳定后，再统一导出和排版为正式 DOCX

当前工作流额外吸收并固定三类最佳实践：

- audience-first：先写评审要判断的价值、系统与结果，再写实现
- progressive disclosure：先主稿总叙事，再分组深写，再证据与图示落地
- content separation：对外主章保持完整阅读体验，内部源稿承担深写、truth-check、图示与证据控制

补充一条 AI-assisted writing 规则：

- 任何深技术章节都要先建立 source pack，再按能力组写，再汇总到主章
- 不允许直接在长章里“边想边写到底”

旧 [docs_output/Spectra.docx](/Users/ln1/Projects/Spectra/docs_output/Spectra.docx) 仅作为：

- 目录骨架参考
- 少量背景/商业/风险叙事素材
- 方案书章节节奏参考

它**不是**当前技术真相源。

## 正式主稿入口

- [写作指导](./00-writing-guide.md)
- [Truth-Check 清单](./00-truth-check-checklist.md)
- [图表规划](./00-figure-plan.md)
- [章节映射](./00-structure-map.md)
- [A 类概要介绍](./11-a-class-project-overview.md)
- [执行摘要](./00-executive-summary.md)
- [前言与项目综述](./01-overview.md)
- [可行性分析](./02-feasibility.md)
- [业务与需求分析](./03-requirements-analysis.md)
- [系统架构设计](./04-architecture.md)
- [关键技术实现](./05-key-technologies.md)
- [项目测试与效果评估](./06-testing-evaluation.md)
- [组织管理](./07-organization-management.md)
- [商业企划](./08-business-plan.md)
- [风险管理](./09-risk-management.md)
- [结语](./10-conclusion.md)

## 内部维护文件

- [对外证据口径](./00-evidence-policy.md)
- [A 类概要介绍图文编排说明](../documentation/a-class-overview-visual-brief.md)
- [第 5 章源稿目录](./05-key-technologies-src/README.md)
- [内部要求覆盖映射](./93-requirements-coverage.md)
- [主稿结构建议](./90-submission-manuscript.md)
- [主稿入口](./91-submission-master.md)
- [合并稿草案](./92-final-submission-draft.md)
- [质量清单](./99-self-review.md)

## 维护清单

- 核心章节起稿前，必须先过一轮 truth-check，不允许只凭旧文档或旧印象下笔。
- 正式主稿正文使用 `00-executive-summary.md` 到 `10-conclusion.md`。
- 正式主稿必须保持“库 / 版本 / 导出物”语义边界清晰，避免回退到“只是在分享 PPT 文件”的表述。
- 正式主稿默认读者只能看到文档本身，不能假定其可访问仓库、Markdown 链接或测试文件。
- `00-writing-guide.md` 和 `99-self-review.md` 仅供内部维护，不进入正式提交正文。
- `00-truth-check-checklist.md` 仅供内部维护，不进入正式提交正文。
- `00-figure-plan.md` 仅供内部维护，用于统一图示与截图规划，不进入正式提交正文。
- `90+` 号文件均为内部维护文件，不进入正式对外交付。
- `92-final-submission-draft.md` 是合并审阅稿，源章节更新后应重新生成，不应手工长期维护两套正文。
- 调整章节顺序、文件名或删除文档时，必须同步修复本目录链接与主稿入口。
- 对于体量过大、同时耦合产品面/架构面/证据面/图示面的章节，默认建立“主章 + 内部源稿目录”双层结构，而不是继续把所有内容硬塞进单个文件。

## 建议生产顺序

优先写：

1. `00-executive-summary`
2. `01-overview`
3. `04-architecture`
4. `06-testing-evaluation`
5. `08-business-plan`

然后再写：

1. `02-feasibility`
2. `03-requirements-analysis`
3. `05-key-technologies`
4. `07-organization-management`
5. `09-risk-management`
6. `10-conclusion`

最后汇总：

1. `90-submission-manuscript`
2. `91-submission-master`
3. `92-final-submission-draft`
4. `99-self-review`
