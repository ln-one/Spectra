# Legacy Crosswalk

> Status: legacy
> Use: internal study only
> Source of truth: no

This file maps the old DOCX structure to the current outward-facing manuscript under `docs/competition/*`.

## Research conclusions

### Old DOCX still provides useful completeness signals

- readers expect a visible system design chapter
- readers expect software technology to be grouped and named
- readers expect database / state / runtime / deployment views to appear somewhere
- readers expect a chapter that proves the system has been implemented and tested
- readers expect risk and commercialization to close the loop
- readers expect organization and conclusion chapters to visibly close the proposal form

### Old DOCX is not safe as truth

- runtime assumptions are often stale
- service boundaries are older and flatter than the current authority-based system
- product identity is weaker and closer to a generic AI teaching tool
- deployment language is conventional rather than aligned with current system reality
- some chapter splits reflect contest-template habits rather than current manuscript logic

### What current manuscript already does better

- stronger product ontology around `课程知识空间`, `Studio`, and formal authorities
- clearer `04 = system design`, `05 = implementation`, `06 = results and evidence` separation
- stronger business and platform narrative in chapter 8
- stronger state, authority, contract, and topology expression in chapters 4 and 5

### What is still worth borrowing from the old DOCX

- completeness signals around database/state/runtime/implementation/test/risk coverage
- title habits that make readers feel the document is a full detailed design proposal
- top-level chapter expectations that match conservative reviewer psychology
- more formal submission-style sentence rhythm in places where current prose can still be tightened

## Old-school completeness signal checklist

The old DOCX is most useful when treated as a checklist of what conservative
reviewers expect to visibly see in a detailed design proposal. The point is not
to restore old content. The point is to judge whether the current manuscript
already emits the same completeness signal in a more truthful way.

| Completeness signal | Current manuscript status | Recommended handling | Notes |
| --- | --- | --- | --- |
| `系统整体架构` | 已覆盖 | keep | `04-architecture.md` already carries the main system-design burden. |
| `实现流程 / 主链流程` | 已覆盖 | keep | Current manuscript is stronger because it uses three main chains instead of one flat pipeline story. |
| `软件技术分组` | 已覆盖 | keep | `05-key-technologies.md` already presents capability-to-technology grouping. |
| `数据与状态设计（数据库设计）` | 已覆盖 | keep | Current manuscript expresses multi-store, multi-authority state instead of fake single-database neatness. |
| `关键接口与契约` | 已覆盖 | keep | Present in chapters 4 and 5 with cleaner layer separation. |
| `运行与交付拓扑` | 已覆盖 | keep | Keep it at credibility-signal level; do not expand it into ops tutorials. |
| `测试目标 / 测试方法 / 结果分析` | 部分覆盖 | light borrow | Chapter 6 is stronger on results and evidence; if needed, only lightly reinforce review-friendly framing, not old test-template bulk. |
| `功能 / 性能 / 兼容性` 三分法 | 部分覆盖 | optional light borrow | Worth using only as a reviewer-facing signal if it improves readability; it must not override the current evidence structure. |
| `组织管理完成面` | 已覆盖 | keep | `07-organization-management.md` already carries governance framing more maturely than the legacy doc. |
| `风险识别 / 风险控制` | 已覆盖 | keep | `09-risk-management.md` already covers this with better structure. |
| `商业闭环` | 已覆盖且更强 | do not borrow | Current chapter 8 is intentionally more advanced than the old contest-template business chapter. |
| `部署与运行环境` | 部分覆盖 | light borrow only | Borrow only the completeness feeling that the system is runnable and deliverable; do not borrow Docker/Nginx/SSL/tutorial content. |
| `健康检查 / 日志链路 / 运维可观测性` | 部分覆盖 | optional light borrow | Only useful as a maturity signal in system/evidence chapters; never as a separate ops-manual block. |
| `本地开发到容器化部署一致性` | 不应借 | reject | This is internal engineering reality, not outward-facing proposal value. |
| `支持 / 具备 / 适配 / 符合` 堆砌句 | 不应借 | reject | It creates template smell without adding real trust. |

## Practical borrowing rule

When deciding whether to add something because the old DOCX "has it", use this
rule:

1. If it improves reviewer-facing completeness without weakening current system truth, it may be lightly borrowed.
2. If it only makes the document look more conventional while dragging us toward stale system assumptions, reject it.
3. If the current manuscript already covers the same signal with stronger structure, keep the current form and do not re-template it.

## Priority tone-borrow map

| Current chapter | What may be borrowed | Purpose |
| --- | --- | --- |
| `01-overview.md` | steadier project-introduction tone, mild scope-setting rhythm | make the opening feel more like a formal proposal without weakening the current system identity |
| `02-feasibility.md` | conventional feasibility cadence and conclusion style | make the chapter feel more familiar to conservative reviewers |
| `04-architecture.md` | “system overview + implementation flow + software technology” completeness feeling | strengthen full-system explanation while preserving current architecture truth |
| `05-key-technologies.md` | old-style “key implementation set” chapter continuity | make technical depth feel more complete and review-friendly |
| `06-testing-evaluation.md` | test-goal / method / result-analysis rhythm signals | make evidence presentation feel more formal and evaluable |
| `07-organization-management.md` | traditional governance/documentation tone | make the chapter read more like an institutional delivery appendix |
| `09-risk-management.md` | conventional risk table and mitigation tone | improve reviewer familiarity without importing stale assumptions |
| `10-conclusion.md` | more formal closing cadence | make the ending feel more like a finalized submission |

## Reference boundary

The old DOCX and this study pack may only feed later writing at the expression layer:

- title structure
- chapter pacing
- formal proposal tone
- completeness signals

They may not feed later writing at the truth layer:

- architecture facts
- service roles
- database/state design truth
- deployment reality
- benchmark conclusions
- business conclusions

## Crosswalk table

| Legacy DOCX signal | Current competition manuscript | Reuse level | Notes |
| --- | --- | --- | --- |
| 1 前言 | `01-overview.md` | 可借结构 | Current manuscript is stronger and more focused. |
| 2 项目综述 | `01-overview.md` + `00-executive-summary.md` | 可借标题习惯 | Current manuscript folds overview into a sharper opening. |
| 3 可行性分析 | `02-feasibility.md` | 可借结构 | Current manuscript is more externally persuasive. |
| 4 业务与需求分析 | `03-requirements-analysis.md` | 可借结构 | Current manuscript is more system-oriented. |
| 5 系统设计 | `04-architecture.md` | 可借结构 | Current manuscript now includes data/state, contracts, runtime topology, and system matrix. |
| 5.2 软件技术 | `05-key-technologies.md` | 可借标题习惯 | Old version is too tool-list-oriented; current version better ties capability to technology. |
| 5.2.12 部署与运行环境 | `04-architecture.md` + `08-business-plan.md` | 内容已过时 | Deployment expectations matter; old details must not return directly. |
| 6 关键技术与实现 | `05-key-technologies.md` | 可借结构 | Current manuscript groups by capability problem rather than tool dump. |
| 6.1 语义模型 / 6.8 版本演进 | `04-architecture.md` + `05-key-technologies.md` | 可借结构 | Formal state expression is now much stronger. |
| 6.2 状态机与事件流 | `04-architecture.md` + `05-key-technologies.md` | 可借结构 | Current manuscript expresses main chain and state responsibility with clearer authority boundaries. |
| 6.3~6.7 全链路实现 | `05-key-technologies.md` + `06-testing-evaluation.md` | 可借结构 | Current manuscript separates implementation from evidence more cleanly. |
| 6.9 成员权限与协作 | `05-key-technologies.md` + `07-organization-management.md` | 可借结构 | Identity and governance are now better framed. |
| 6.14 微服务边界 | `04-architecture.md` | 可借结构 | Current manuscript uses formal authorities and heterogenous-system framing. |
| 7 测试与成果展示 | `06-testing-evaluation.md` | 可借结构 | Current manuscript is stronger because it leads with results. |
| 8 组织管理 | `07-organization-management.md` | 可借标题习惯 | Current manuscript shifts from team intro toward governance framework. |
| 9 商业企划 | `08-business-plan.md` | 可借结构 | Current manuscript is much stronger on platform and asset-network logic. |
| 10 风险管理 | `09-risk-management.md` | 可借结构 | Current manuscript is more mature and less template-like. |
| 11 结语 | `10-conclusion.md` | 可借标题习惯 | Current manuscript gives the conclusion stronger strategic weight. |

## Do-not-return list

- generic “AI teaching tool” identity
- stale deployment defaults
- flat monolithic backend assumptions
- single-database mental model
- software technology written as dependency inventory
- copying legacy prose into current outward-facing chapters
- using the old DOCX as a hidden fact source because it “sounds more formal”
