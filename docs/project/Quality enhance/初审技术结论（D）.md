# 初审技术结论（D）

> 更新时间：2026-03-25
> 状态：当前生效
> 定位：成员 D 当前阶段可直接供初审材料复用的技术结论

## 1. 结论摘要

当前阶段，成员 D 可以稳定支撑的技术结论主要有四类：

1. Spectra 已具备可复现的检索 baseline，而不是纯黑箱生成
2. PPT / 大纲 / 卡片质量优化已经形成“样本 + baseline + 对照 + 方法”的工作闭环
3. Project Space / quality gate / baseline 工具链已经具备，可支撑后续联调冻结
4. 当前项目不再缺主干骨架，D 的价值重点是质量证据化和方法论沉淀

## 2. 检索与引用不是黑箱

### 可直接引用的事实

1. `backend/eval/baselines/rag-baseline-v1.json` 中，真实项目样本的 `keyword_hit_rate = 0.9`
2. 同一基线中，`failure_rate = 0.0`
3. `backend/eval/baselines/source-quality-baseline-v1.json` 中，来源 `coverage_rate = 1.0`
4. 同一基线中，来源 `readability_rate = 1.0`

### 可用于材料的表述

1. Spectra 的检索链路已经具备可复现的 baseline，不是不可解释的黑箱拼接
2. 系统不仅追求“有答案”，还追求“答案与来源可对齐、可展示、可回归”

### 需要保守表述的点

1. 来源相关性仍有继续提升空间，不应写成“来源完全准确无误”

## 3. 检索与资源排序已进入可回归阶段

### 可直接引用的事实

1. `backend/eval/baselines/network-resource-baseline-v1.json` 中：
   - `normalization_rate = 1.0`
   - `relevance_pass_rate = 1.0`
   - `low_quality_reject_rate = 1.0`
   - `citation_ready_rate = 1.0`
2. 同一基线中，`gate_passed = true`

### 可用于材料的表述

1. Spectra 已经把网络资源排序与筛选纳入正式质量门禁
2. 外部资源不是直接生吞，而是经过标准化、相关性判断、低质量过滤和引用准备检查

### 需要保守表述的点

1. 当前更强的“重排质量证据”主要来自资源排序层，不应夸大为“所有主链路 reranking 已完全解决”

## 4. PPT 质量优化已经进入证据化阶段

### 可直接引用的事实

1. 当前已具备：
   - `backend/eval/ppt_quality_audit.py`
   - `backend/eval/ppt_quality_baseline.py`
   - `backend/eval/ppt_quality_comparison_audit.py`
2. `backend/eval/baselines/ppt-quality-baseline-v1.json` 中：
   - `structure_pass_rate = 0.8333`
   - `information_density_pass_rate = 0.6667`
   - `visual_balance_pass_rate = 0.6667`
   - `image_match_pass_rate = 0.6667`
   - `overall_pass_rate = 0.1667`

### 可用于材料的表述

1. 项目没有停留在“主观觉得 PPT 好不好”的阶段，而是已经把 PPT 质量拆成结构、信息密度、图文比例、表达、图片命中等可复现指标
2. 当前 baseline 已经明确暴露出 PPT 质量的主要缺口，因此后续优化有清晰抓手

### 需要保守表述的点

1. 当前不能写成“PPT 质量已经完全收口”
2. 更准确的说法是“PPT 质量已经进入可量化优化阶段”

## 5. 大纲质量优化已经具备专项基线

### 可直接引用的事实

1. 当前已具备：
   - `backend/eval/outline_quality_audit.py`
   - `backend/eval/outline_quality_baseline.py`
2. `backend/eval/baselines/outline-quality-baseline-v1.json` 中：
   - `title_uniqueness_pass_rate = 0.75`
   - `key_point_uniqueness_pass_rate = 0.5`
   - `cross_section_progression_pass_rate = 0.75`
   - `expression_specificity_pass_rate = 0.75`
   - `overall_pass_rate = 0.25`

### 可用于材料的表述

1. Spectra 已经把大纲重复问题从“体验问题”转成了专项质量问题
2. 当前系统可以明确识别重复标题、重复知识点、页间同义反复等问题，并对后续优化形成基线约束

## 6. 质量方法已经形成统一路径

### 可直接引用的事实

1. 已形成以 PPT 为主锚点的整体质量方法
2. 已形成卡片生成质量优化方案
3. 已形成检索、提示词、图片命中的统一评测口径
4. 已形成面向主线接入的质量优化建议

### 可用于材料的表述

1. D 侧工作不是零散调 prompt，而是形成了一套“样本 -> baseline -> 规则 -> 对照 -> 结论”的统一方法
2. 这套方法可以从 PPT 迁移到大纲、卡片和其他生成结果

## 7. Project Space 质量门禁已经具备工程基础

### 可直接引用的事实

1. 已具备 `project_space_quality_gate.py`
2. 已具备 `project_space_quality_baseline.py`
3. 已具备 baseline freeze/check、guardrail 关联、baseline 路径关联和 `--json` 输出

### 可用于材料的表述

1. Spectra 不是只生成结果，还对结果如何进入项目空间、如何进入历史、如何进入质量门禁有正式工程约束
2. 这使系统更接近“可演进知识空间”，而不是一次性输出工具

### 需要保守表述的点

1. 最终 freeze/check 仍需等 B/C 联调完成后再冻结，不应写成“全链路最终验收已结束”

## 8. 当前最适合放进初审材料的技术亮点

建议优先采用以下三条：

1. `可复现的检索与引用 baseline`：证明系统不是黑箱生成
2. `以 PPT 为主锚点的统一质量方法`：证明系统能持续优化，而不是只靠一次性 demo
3. `Project Space 质量门禁与 artifact 语义`：证明系统把结果纳入可追踪、可回归的知识空间

## 9. 当前不建议写进最终结论的内容

1. “所有生成质量问题都已经解决”
2. “所有重排质量都已经完全收口”
3. “Project Space 已完成最终联调冻结”
4. “PPT / Word / 卡片所有主链路功能都由 D 侧完成”

这些说法要么过度扩张，要么和当前职责边界不一致。
