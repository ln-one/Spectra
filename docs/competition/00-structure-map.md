# Spectra 商业方案书章节映射

> Status: `current`
> Role: internal chapter map from the legacy `Spectra.docx` rhythm to the rebuilt external commercial proposal.

## 1. 使用目的

这份文件只用于内部写作控制，不进入对外交付正文。

它解决两个问题：

1. 旧 `Spectra.docx` 的大目录节奏如何映射到当前主稿；
2. 当前哪些章节是保留、拆分、降级或重写。

## 2. 旧骨架到新主稿的映射

| 旧 `docx` 大章节 | 当前主稿文件 | 处理方式 |
| --- | --- | --- |
| 前言 | `01-overview.md` | 重写 |
| 项目综述 | `00-executive-summary.md` + `01-overview.md` | 重写并前置摘要 |
| 可行性分析 | `02-feasibility.md` | 重写 |
| 业务与需求分析 | `03-requirements-analysis.md` | 重写 |
| 系统设计 | `04-architecture.md` | 重写 |
| 关键技术与实现 | `05-key-technologies.md` + `05-key-technologies-src/` | 重写 |
| 项目测试与成果展示 | `06-testing-evaluation.md` | 重写 |
| 组织管理 | `07-organization-management.md` | 重写并收口为外部可读版本 |
| 商业企划 | `08-business-plan.md` + `08-business-plan-src/` | 重写并拆分源稿 |
| 风险管理 | `09-risk-management.md` | 新增/重写 |
| 结语 | `10-conclusion.md` | 新增/重写 |

## 3. 当前文件分层

### 3.1 对外主稿正文

- `00-executive-summary.md`
- `01-overview.md`
- `02-feasibility.md`
- `03-requirements-analysis.md`
- `04-architecture.md`
- `05-key-technologies.md`
- `06-testing-evaluation.md`
- `07-organization-management.md`
- `08-business-plan.md`
- `09-risk-management.md`
- `10-conclusion.md`

### 3.2 内部写作控制文件

- `00-writing-guide.md`
- `00-truth-check-checklist.md`
- `00-evidence-policy.md`
- `00-figure-plan.md`
- `00-structure-map.md`
- `04-architecture-src/README.md`
- `05-key-technologies-src/README.md`
- `08-business-plan-src/README.md`
- `90-submission-manuscript.md`
- `91-submission-master.md`
- `92-final-submission-draft.md`
- `93-requirements-coverage.md`
- `99-self-review.md`

## 4. 保留 / 合并 / 降级 / 重写

### 4.1 保留的只有“节奏”

旧 `Spectra.docx` 可以保留的，主要只有：

- 商业方案书的大章节顺序；
- 篇章节奏；
- 少量背景、目标、商业与风险类表达素材。

### 4.2 已合并

- 旧“前言 + 项目综述”节奏被拆成：
  - `00-executive-summary.md`
  - `01-overview.md`
- 旧“组织管理 + 商业企划”的模糊边界被拆成：
  - `07-organization-management.md`
  - `08-business-plan.md`

### 4.3 已降级

- “题目要求覆盖说明”降级为内部映射文件：`93-requirements-coverage.md`
- `90+` 号文件全部视为内部维护层，不进入正式对外交付

### 4.4 必须持续重写的区域

- 系统设计
- 关键技术与实现
- 成果与效果展示
- 任何还保留仓库内证据表达、文件跳转表达、旧稿内部叙事表达的段落

## 5. 约束

- 外部主稿必须假定读者只能看到最终文档本身。
- 旧 `docx` 的正文不作为技术真相源。
- 旧文档的“仓库味”“内部验证味”“临时拼稿味”都不能回流到主稿。
- 当前编号保持不变：`06-testing-evaluation.md` 是“项目测试与成果展示”主章，`07-organization-management.md` 是“组织管理”主章。
- 第 5 章只承接技术机制和少量结论级证据，第 6 章承接“成果展示 + 正式证据”，测试集、benchmark、系统验证和完整指标表都应服务于外部读者理解“已经做成了什么、为什么可信”。
- 第 4 章已采用“对外主章 + `04-architecture-src/` 内部源稿”结构；继续深写系统本体、Studio 产品面、控制平面、主链和运行拓扑时，先进入源稿再汇总主章。
- 第 4 章 = 系统设计视图；第 5 章 = 技术实现视图。第 4 章不重复展开实现机制，第 5 章不重新解释系统本体和总体分层。
- 第 3 章负责业务问题、系统级需求与对象语言，不退回普通功能清单。
- 第 7 章负责组织治理、交付治理与质量治理，不退回内部分工说明。
- 第 8 章对外保持商业方案书阅读体验；若继续扩写平台生态、收入层级、课程资产交易、学习者增值或网络效应，必须先进入 `08-business-plan-src/` 源稿，再汇总进主章。
- 第 2 章负责系统成立性与试点可行性，第 9 章负责风险治理与残余风险，不与第 8 章争夺商业主线。
