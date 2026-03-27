# PPT 插图策略接入输入包

> 更新时间：2026-03-27
> 状态：当前生效
> 定位：成员 D 交付给成员 C 的 PPT 插图主链路接入输入包

## 1. 目的

本输入包用于把成员 D 已完成的插图策略、样本、baseline 和结论整理成可直接供成员 C 接主链路的稳定输入。

本输入包不由 D 直接实现到主链路，而是为 C 提供：

1. 可复用的规则来源
2. 已验证的样本与 baseline
3. 建议保留的决策元数据字段
4. 建议接入顺序和最小验收标准

## 2. 交付范围

本输入包覆盖以下四类输入：

1. 选图页规则
2. 插图位规则
3. 插图数量与版式风险规则
4. 插图专项样本、baseline 与前后对照

当前不覆盖：

1. PPT 图片主链路运行时实现本身
2. artifact/download/export 正式闭环
3. 前端展示和演示层消费逻辑

## 3. 规则来源

成员 C 接入时，应以以下文档和资产为准：

1. [PPT插图可接入规则包.md](./PPT插图可接入规则包.md)
2. [PPT图片召回与素材命中优化方案.md](./PPT图片召回与素材命中优化方案.md)
3. [PPT插图策略方案.md](./PPT插图策略方案.md)
4. [提示词工程参考资料清单.md](./提示词工程参考资料清单.md)

其中：

1. `PPT插图可接入规则包` 是当前最直接的接入规则源。
2. 图片召回与插图策略文档用于补充策略来源和质量判断原则。
3. 提示词工程参考资料清单用于约束后续 prompt 规则接入方式，避免变成临时分叉。

## 4. 已交付的评测与样本资产

成员 C 接入时，应同时参考以下评测资产：

1. `backend/eval/ppt_image_quality_audit.py`
2. `backend/eval/ppt_image_quality_baseline.py`
3. `backend/eval/ppt_image_quality_comparison_audit.py`
4. `backend/eval/ppt_image_quality_samples.json`
5. `backend/eval/ppt_image_quality_comparison_samples.json`
6. `backend/eval/baselines/ppt-image-quality-baseline-v1.json`

当前插图专项质量维度为：

1. `page_selection_pass_rate`
2. `placement_pass_rate`
3. `quantity_pass_rate`
4. `layout_risk_control_pass_rate`
5. `text_image_alignment_pass_rate`
6. `overall_pass_rate`

## 5. 建议保留的决策元数据字段

成员 C 接主链路时，建议至少保留以下字段，避免后续质量结论无法回溯：

1. `retrieval_mode`
   - `default_library` 或 `strict_sources`
2. `page_semantic_type`
3. `image_insertion_decision`
   - `insert` / `skip`
4. `image_count`
5. `image_slot`
   - 如 `left_split` / `right_split` / `bottom_panel`
6. `layout_risk_level`
   - `low` / `medium` / `high`
7. `image_match_reason`
8. `skip_reason`

若联调链路允许，建议附加保留以下增强观测字段：

1. `rag_failure_reason`
2. `rag_query_length`
3. `source_not_found`
4. `source_not_ready`
5. `rag_no_match`
6. 生成阶段耗时

以上增强字段当前只作为证据增强使用，不应成为主链路接入的阻塞条件。

## 6. 接入顺序建议

建议成员 C 按以下顺序接入：

1. 先接入页选择、图位、数量与版式风险规则
2. 再接入建议元数据字段，保证结果可解释
3. 接入后立刻复用插图专项 baseline 和前后对照样本
4. 最后再结合联调结果补观测增强字段

不建议反过来先改主链路行为、最后再补规则和样本。

## 7. 最小验收标准

成员 C 接入后，至少应能回答以下问题：

1. 为什么这一页被判定为值得插图或不值得插图
2. 为什么图被放在这个位置
3. 为什么是一张图而不是零张或两张
4. 为什么这次插图失败是检索问题、策略问题，还是版式问题
5. 当前结论属于哪种检索语义：
   - 不传 `rag_source_ids`：默认库检索
   - 传 `rag_source_ids`：严格限源检索

## 8. 当前边界

1. 本输入包由 D 交付，不代表 D 接手图片主链路实现。
2. D 的交付目标是“给出可接入输入”，不是“替 C 完成功能闭环”。
3. 若接入后与主链路语义冲突，应优先保持主链路语义一致，再由 D 做二轮质量收口。
