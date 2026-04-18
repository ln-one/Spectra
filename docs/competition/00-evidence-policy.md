# Spectra 对外证据口径

> Status: `current`
> Role: internal evidence whitelist for outward-facing commercial and showcase writing.

本文件只回答一件事：后续商业主稿、展示稿和对外介绍里，哪些证据可以直接拿来写，哪些只能降级使用，哪些不能用。

## 1. 可直接用于主展示结论

以下材料可以直接支撑主展示结论：

- 最新正式 benchmark / report 文件
- live code 对应的当前行为现实
- focused passing tests
- 当前服务 README / docs
- 当前 compose / runtime reality

当前 `Stratumind` / RAG 主展示默认使用：

- `stratumind/benchmarks/reports/promoted60_raw_dense_topk.json`
- `stratumind/benchmarks/reports/promoted60_dense_only.json`
- `stratumind/benchmarks/reports/promoted60_advanced.json`
- `stratumind/benchmarks/reports/promoted105_raw_dense_topk.json`
- `stratumind/benchmarks/reports/promoted105_dense_only.json`
- `stratumind/benchmarks/reports/promoted105_advanced.json`

## 2. 只能作为补充技术材料

以下材料可以用来说明技术深度、演化过程或实验方向，但默认不能作为主展示成绩：

- `stratumind/benchmarks/reports/late_interaction_showcase_report.md`
- `stratumind/benchmarks/reports/dense_only_vs_stratumind_advanced_20260415_133658.json`
- 其他较早的 gold-dataset、showcase、A/B 实验稿

写法要求：

- 必须标成“补充实验”或“技术实验”
- 不得与最新正式集主成绩并列成同一层级结论

## 3. 禁止进入主展示结论

以下材料默认禁止作为主展示质量/性能结论：

- `docs/project/*` 中的旧质量结论
- 阶段性技术总结
- 未标明为最新正式集的数据
- 用户已经明确判定“不可信”的内部材料

典型禁用示例包括：

- 旧稿中把关键词命中率写成九成的阶段性口径
- 旧稿中把覆盖率写成满分的阶段性口径
- 旧稿中把可读性写成满分的阶段性口径

这些数字即使保留在历史文档中，也不应再进入当前商业主稿主论证。

## 4. 使用原则

1. 主展示成绩 = 最新正式集
2. 补充技术说明 = 早期实验稿，可选且降级表述
3. 旧阶段数据不得与正式集口径混用
4. 如果一个数字无法明确追溯到当前正式报告，就不要拿它吹

## 5. 章节分层

正式主稿的证据分工固定如下：

- 第 5 章“关键技术与实现”：只放机制说明、关键技术路径、必要 Mermaid 图和结论级证据摘要。
- 第 6 章“项目测试与成果展示”：承接测试集构造、基线与对比方案设计、完整指标表、benchmark 解释、系统验证和商业含义。
- 第 7 章“组织管理”：只讲组织推进与治理方式，不承接测试数据。

`Stratumind` 的完整正式集数据、指标解释和业务含义统一放在第 6 章。第 5 章最多保留 `advanced` 链路的代表性结果，避免把关键技术章写成 benchmark 仓库。

`Dualweave` 的对外数据必须满足更高证据门槛：没有正式最新场景报告前，只能写评估维度、场景化 benchmark 方法和工程验证现实，不写具体性能提升倍数。
