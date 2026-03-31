# RAG 评测系统

## 语义边界

`backend/eval` 中的数据集字段、评测指标、基线门禁，属于评测工具层语义。

它们用于回答：
- RAG 是否检到
- 排序是否稳定
- 结果是否足够支撑回答或生成

它们不属于 `project-space` 运行时领域模型，不应被解释为 `Project / Session / Artifact / Reference / Version / CandidateChange` 的产品语义扩展，也不应反向推导为运行时 API 合同字段。

## 目录结构

当前目录保持兼容性的扁平布局，但按逻辑可分为以下几组：

```
eval/
├── dataset.json        # 通用 RAG 评测数据集
├── dataset_d51_real_project_space.json
├── dataset_d51_real_project_space_expanded.json
├── metrics.py          # RAG 指标计算
├── run_eval.py         # RAG 评测脚本入口
├── baseline_manager.py # RAG 基线冻结/回归校验工具
├── relevant_chunk_resolver.py # relevant_chunk_ids 自动解析
├── baselines/          # 提交到仓库的基线快照
├── results/            # 评测结果输出（gitignore）
└── README.md
```

目录逻辑分组说明见：

- [EVAL_DIRECTORY_STRUCTURE.md](d:/Code/Spectra/backend/eval/EVAL_DIRECTORY_STRUCTURE.md)

## 快速使用

```bash
cd backend
# 运行评测（需要真实项目 ID 和已索引文档）
.venv-wsl/bin/python eval/run_eval.py --project-id <project_id>

# 指定 top_k 和输出路径
.venv-wsl/bin/python eval/run_eval.py --project-id <id> --top-k 3 --output eval/results/run1.json

# 与基线对比
.venv-wsl/bin/python eval/run_eval.py --project-id <id> --baseline eval/baselines/rag-baseline-v1.json

# 通过后端 API 运行评测（推荐 Windows / 远程环境）
.venv-wsl/bin/python eval/run_eval.py \
  --project-id <id> \
  --api-base-url http://127.0.0.1:8000/api/v1 \
  --api-email eval_runner@example.com \
  --api-password "StrongPass!2026"
```

Windows 环境可将解释器替换为 `venv/Scripts/python.exe`。

## 基线收口（D-5.1）

```bash
cd backend

# 1) 先产出一次当前评测结果
.venv-wsl/bin/python eval/run_eval.py \
  --project-id <project_id> \
  --output eval/results/latest.json \
  --tag d5.1-baseline-candidate

# 2) 冻结为可追溯基线（该文件应提交到仓库）
.venv-wsl/bin/python eval/baseline_manager.py freeze \
  --result eval/results/latest.json \
  --output eval/baselines/rag-baseline-v1.json \
  --notes "D-5.1 first stable baseline"

# 3) 后续每次优化后执行回归校验
.venv-wsl/bin/python eval/baseline_manager.py check \
  --current eval/results/latest.json \
  --baseline eval/baselines/rag-baseline-v1.json
```

真实项目收口（推荐）：

```bash
cd backend

# 使用真实项目评测集（基于 docs/project/requirements.md）
.venv-wsl/bin/python eval/run_eval.py \
  --project-id <real_project_id> \
  --dataset eval/dataset_d51_real_project_space.json \
  --output eval/results/d51_real_project_latest.json \
  --tag d5.1-real-project

# 冻结真实项目基线
.venv-wsl/bin/python eval/baseline_manager.py freeze \
  --result eval/results/d51_real_project_latest.json \
  --output eval/baselines/rag-baseline-v1.json \
  --notes "D-5.1 real-project baseline"
```

默认门禁阈值：
- `keyword_hit_rate` 最多下降 `3%`
- `failure_rate` 最多上升 `5%`
- `avg_latency_ms` 最多上升到 `1.5x`
- `p95_latency_ms` 最多上升到 `1.75x`
- `fact_coverage_rate` 最多下降 `3%`
- `usable_top1_rate` 最多下降 `5%`
- `usable_top3_rate` 最多下降 `3%`
- `distractor_intrusion_rate` 最多上升 `5%`
- `explainability_rate` 最多下降 `2%`
- `continuity_rate` 最多下降 `2%`
- `fallback_hit_rate` 最多下降 `5%`
- hard floor: `explainability_rate >= 95%`、`continuity_rate >= 95%`

## RAG 强指标说明

当前 RAG 评测建议优先看以下指标：

| 指标 | 含义 | 作用 |
|------|------|------|
| `rankable_case_coverage_rate` | 可参与排序评测的样本覆盖率 | 判断 TopK 排序指标是否有统计意义 |
| `keyword_hit_rate` | 检索结果中命中至少一个期望关键词的比例 | 反映基础召回是否有效 |
| `keyword_coverage_rate` | 每条用例期望关键词的平均覆盖比例 | 比 `keyword_hit_rate` 更严格 |
| `fact_coverage_rate` | Top3 结果对必备事实点的平均覆盖比例 | 判断结果是否足够回答问题 |
| `usable_top1_rate` | Top1 是否已是可直接使用的证据块 | 判断第一条结果是否真正可用 |
| `usable_top3_rate` | Top3 中是否存在可直接使用的证据块 | 判断下游聚合 Top3 后的可用性 |
| `distractor_intrusion_rate` | Top1 被噪声挤占、但 Top3 内仍有可用证据的比例 | 判断排序污染程度 |
| `hit_rate@1` | Top1 命中率 | 反映第一条结果是否可靠 |
| `hit_rate@3` | Top3 命中率 | 反映前 3 条结果的可用性 |
| `hit_rate@5` | Top5 命中率 | 反映前 5 条结果的覆盖能力 |
| `mrr@k` | 第一条相关结果的排名质量 | 反映正确结果排得是否靠前 |
| `ndcg@k` | 归一化排序质量指标 | 比单纯命中率更适合展示排序质量 |
| `avg_latency_ms` | 平均检索延迟 | 反映线上响应成本 |
| `p95_latency_ms` | P95 检索延迟 | 反映尾部慢请求风险 |
| `failure_rate` | 检索失败率 | 反映基础稳定性 |

## 指标说明

| 指标 | 说明 |
|------|------|
| `keyword_hit_rate` | 结果内容包含期望关键词的用例比例（主要指标，无需 ground-truth） |
| `keyword_coverage_rate` | 期望关键词平均覆盖比例，比 `keyword_hit_rate` 更严格 |
| `fact_coverage_rate` | Top3 结果对 `required_facts` 的平均覆盖比例，强调“够不够回答” |
| `usable_top1_rate` | Top1 同时命中 `usable_chunk_ids` 且满足事实覆盖阈值的比例 |
| `usable_top3_rate` | Top3 中存在“可用证据块”的比例 |
| `distractor_intrusion_rate` | Top1 不可用、但 rank2/rank3 存在可用证据时记为一次干扰侵入 |
| `hit_rate@k` | 前 k 个结果命中相关 chunk 的比例（需标注 relevant_chunk_ids） |
| `mrr@k` | Mean Reciprocal Rank（需标注 relevant_chunk_ids） |
| `ndcg@k` | 排序质量指标（需标注 relevant_chunk_ids） |
| `rankable_case_coverage_rate` | 有 ground truth 的样本比例，反映排序指标是否有统计意义 |
| `avg_latency_ms` | 平均检索延迟（毫秒） |
| `p95_latency_ms` | P95 检索延迟（毫秒），反映尾延迟风险 |
| `failure_rate` | 检索失败（异常/空结果）比例 |

## 扩展数据集

在 `dataset.json` 的 `cases` 数组中添加用例：

```json
{
  "id": "edu-011",
  "query": "你的查询问题",
  "expected_keywords": ["关键词1", "关键词2"],
  "relevant_chunk_ids": [],
  "category": "subject",
  "difficulty": "easy|medium|hard"
}
```

如果有已知的相关 chunk ID，填入 `relevant_chunk_ids` 可启用 hit_rate 和 MRR 计算。

也可以使用以下可选字段，让脚本在当前项目中自动解析 `relevant_chunk_ids`：

```json
{
  "id": "real-011",
  "query": "项目的核心目标是什么",
  "expected_keywords": ["教学智能体", "课件共创系统"],
  "relevant_chunk_ids": [],
  "relevant_source_contains": ["开发一个多模态AI互动式教学智能体"],
  "min_keyword_hits": 1,
  "category": "goal",
  "difficulty": "easy"
}
```

说明：
- `relevant_source_contains`：来源文本中的锚点短语。`run_eval.py` 会在当前项目已索引的分块中做包含匹配，并自动补全 `relevant_chunk_ids`。
- `min_keyword_hits`：如果未配置来源锚点，脚本会退回到 `expected_keywords` 命中策略；该字段用于控制最少关键词命中数。

如果要启用更严格的“可用性评测”，建议继续补以下字段：

```json
{
  "required_facts": ["教学目标", "教学过程", "教学方法"],
  "usable_chunk_ids": [],
  "usable_source_contains": ["生成与PPT配套的详细教案，包括教学目标、教学过程、教学方法"],
  "usable_min_fact_coverage": 0.5,
  "fact_top_k": 3
}
```

说明：
- `required_facts`：这条 query 真正必须覆盖的事实点。优先于 `expected_keywords`。
- `usable_chunk_ids`：不仅相关，而且可直接回答问题的 chunk。
- `usable_source_contains`：可用证据块的来源锚点短语，可自动解析为 `usable_chunk_ids`。
- `usable_min_fact_coverage`：单个 chunk 至少覆盖多少事实，才算“可用”。
- `fact_top_k`：计算事实覆盖率时，最多看前多少条结果。

## D4 来源质量抽样评测（先行版）

```bash
cd backend

# 运行来源质量评测（基于 RAGSearch/SourceDetail/Preview sources 字段）
.venv-wsl/bin/python eval/source_quality_audit.py \
  --dataset eval/source_audit_samples.json \
  --output eval/results/source_audit_latest.json

# 冻结首版来源质量基线
.venv-wsl/bin/python eval/source_quality_baseline.py freeze \
  --result eval/results/source_audit_latest.json \
  --output eval/baselines/source-quality-baseline-v1.json \
  --notes "D4 source quality baseline v1"

# 后续改动后执行回归校验
.venv-wsl/bin/python eval/source_quality_baseline.py check \
  --current eval/results/source_audit_latest.json \
  --baseline eval/baselines/source-quality-baseline-v1.json
```

## D1 Provider Harness 基线管理

```bash
cd backend

# 运行 provider harness（mock 对比）
.venv-wsl/bin/python eval/provider_harness.py \
  --sample-pool eval/provider_sample_pool.json \
  --thresholds eval/provider_thresholds.json \
  --output eval/results/provider_harness_latest.json

# 冻结首版 provider harness 基线
.venv-wsl/bin/python eval/provider_harness_baseline.py freeze \
  --result eval/results/provider_harness_latest.json \
  --output eval/baselines/provider-harness-baseline-v1.json \
  --notes "D1 provider harness baseline v1"

# 后续改动后执行回归校验
.venv-wsl/bin/python eval/provider_harness_baseline.py check \
  --current eval/results/provider_harness_latest.json \
  --baseline eval/baselines/provider-harness-baseline-v1.json
```

评测指标：
- `coverage_rate`：输出是否具备来源
- `readability_rate`：来源字段是否可读可定位（chunk_id/source_type/filename/page|timestamp）
- `relevance_rate`：输出文本与来源文本关键词重合

## D6 对话资料记忆质量评测

```bash
cd backend

# 运行资料记忆对话评测
.venv-wsl/bin/python eval/dialogue_memory_audit.py \
  --dataset eval/dialogue_memory_samples.json \
  --output eval/results/dialogue_memory_latest.json

# 运行 D-PS3 联调样本（session 作用域 + 协议一致性）
.venv-wsl/bin/python eval/dialogue_memory_audit.py \
  --dataset eval/dialogue_memory_samples_dps3.json \
  --output eval/results/dialogue_memory_dps3_latest.json
```

评测指标：
- `hit_rate`：有资料问题中，回答是否命中期望来源
- `misquote_rate`：回答引用错误来源的比例
- `no_hit_notice_rate`：无可用资料时是否明确提示“未命中资料”
- `contract_consistency_rate`：`message.content / citations[] / rag_hit / observability.has_rag_context` 一致率
- `session_isolation_rate`：资料来源是否严格落在当前 `session_id` 作用域
- `gate_passed`：是否通过数据集阈值门禁（支持 `thresholds` 配置）

## D7 大纲流质量评测

```bash
cd backend

# 运行大纲流质量评测（初稿 -> 重写 -> 确认）
.venv-wsl/bin/python eval/outline_flow_audit.py \
  --dataset eval/outline_flow_samples.json \
  --output eval/results/outline_flow_latest.json
```

评测指标：
- `draft_structure_pass_rate`：初稿结构完整率
- `rewrite_improvement_rate`：重写后质量提升率
- `confirm_ready_rate`：确认阶段可进入生成比例

## P0 PPT 质量样本与 baseline

```bash
cd backend

# 运行 PPT 质量抽样评测（结构/密度/图文比例/表达/图片命中）
.venv-wsl/bin/python eval/ppt_quality_audit.py \
  --dataset eval/ppt_quality_samples.json \
  --output eval/results/ppt_quality_latest.json

# 冻结首版 PPT 质量基线
.venv-wsl/bin/python eval/ppt_quality_baseline.py freeze \
  --result eval/results/ppt_quality_latest.json \
  --output eval/baselines/ppt-quality-baseline-v1.json \
  --notes "P0 PPT quality baseline v1"

# 后续改动后执行回归校验
.venv-wsl/bin/python eval/ppt_quality_baseline.py check \
  --current eval/results/ppt_quality_latest.json \
  --baseline eval/baselines/ppt-quality-baseline-v1.json
```

评测指标：
- `structure_pass_rate`：页面结构是否清晰
- `information_density_pass_rate`：信息密度是否适中
- `visual_balance_pass_rate`：图文比例与版面平衡是否合格
- `expression_pass_rate`：教学表达是否清楚
- `image_match_pass_rate`：图片/素材是否与内容匹配
- `overall_pass_rate`：是否可视为当前阶段可展示结果

## P0 PPT 前后对照样本

```bash
cd backend

.venv-wsl/bin/python eval/ppt_quality_comparison_audit.py \
  --dataset eval/ppt_quality_comparison_samples.json \
  --output eval/results/ppt_quality_comparison_latest.json
```

评测指标：
- `overall_improvement_rate`：优化后整体质量提升的样本比例
- `dimension_improvement_rate`：各维度从不通过到通过的提升比例
- `improved_sample_ids`：明确提升的样本 ID
- `non_improved_sample_ids`：未提升或退化的样本 ID

## P0 PPT 插图质量专项

```bash
cd backend

.venv-wsl/bin/python eval/ppt_image_quality_audit.py \
  --dataset eval/ppt_image_quality_samples.json \
  --output eval/results/ppt_image_quality_latest.json

.venv-wsl/bin/python eval/ppt_image_quality_baseline.py freeze \
  --result eval/results/ppt_image_quality_latest.json \
  --output eval/baselines/ppt-image-quality-baseline-v1.json \
  --notes "P0 ppt image quality baseline v1"

.venv-wsl/bin/python eval/ppt_image_quality_baseline.py check \
  --current eval/results/ppt_image_quality_latest.json \
  --baseline eval/baselines/ppt-image-quality-baseline-v1.json

.venv-wsl/bin/python eval/ppt_image_quality_comparison_audit.py \
  --dataset eval/ppt_image_quality_comparison_samples.json \
  --output eval/results/ppt_image_quality_comparison_latest.json
```

评测指标：
- `page_selection_pass_rate`：该插图页是否真的值得插图
- `placement_pass_rate`：图位是否稳定、便于讲解
- `quantity_pass_rate`：图片数量是否合理
- `layout_risk_control_pass_rate`：是否避免高风险版式
- `text_image_alignment_pass_rate`：图文是否服务同一结论
- `overall_pass_rate`：是否可视为当前阶段可接入的插图结果

## P0 大纲重复质量 baseline

```bash
cd backend

.venv-wsl/bin/python eval/outline_quality_audit.py \
  --dataset eval/outline_quality_samples.json \
  --output eval/results/outline_quality_latest.json

.venv-wsl/bin/python eval/outline_quality_baseline.py freeze \
  --result eval/results/outline_quality_latest.json \
  --output eval/baselines/outline-quality-baseline-v1.json \
  --notes "P0 outline quality baseline v1"

.venv-wsl/bin/python eval/outline_quality_baseline.py check \
  --current eval/results/outline_quality_latest.json \
  --baseline eval/baselines/outline-quality-baseline-v1.json
```

评测指标：
- `title_uniqueness_pass_rate`：章节标题是否不重复
- `key_point_uniqueness_pass_rate`：关键要点是否不重复
- `cross_section_progression_pass_rate`：相邻章节是否推进而非复述
- `expression_specificity_pass_rate`：标题与要点是否足够具体
- `overall_pass_rate`：整体是否可视为当前阶段可接受大纲

## D-8.3 引用标注质量评测

```bash
cd backend

# 运行引用标注质量评测（Markdown + <cite> 协议）
.venv-wsl/bin/python eval/citation_quality_audit.py \
  --dataset eval/citation_audit_samples.json \
  --output eval/results/citation_audit_latest.json
```

评测指标：
- `citation_coverage_rate`：应引用样本中是否给出有效 `<cite chunk_id="..."></cite>`
- `misquote_rate`：引用的 chunk_id 不在允许来源集合中的比例
- `paragraph_relevance_rate`：带引用段落与来源文本的相关性通过率
- `empty_citation_rate`：空引用（缺失 chunk_id）比例

## D-8.5 模型路由质量门禁评测

```bash
cd backend

# 运行模型路由质量门禁评测（质量/延迟/成本 + fallback）
.venv-wsl/bin/python eval/router_quality_audit.py \
  --dataset eval/router_quality_samples.json \
  --output eval/results/router_quality_latest.json

# 冻结首版路由门禁基线
.venv-wsl/bin/python eval/router_quality_baseline.py freeze \
  --result eval/results/router_quality_latest.json \
  --output eval/baselines/router-quality-baseline-v1.json \
  --notes "D-8.5 router quality baseline v1"

# 后续改动后执行回归校验
.venv-wsl/bin/python eval/router_quality_baseline.py check \
  --current eval/results/router_quality_latest.json \
  --baseline eval/baselines/router-quality-baseline-v1.json
```

评测指标：
- `quality_delta`：路由后平均质量相对“全量大模型基线”的变化
- `latency_reduction_rate`：路由后平均延迟下降比例
- `cost_reduction_rate`：路由后平均成本下降比例
- `fallback_rate`：小模型失败或质量不达标后升级到大模型比例
- `non_degradable_misroute_rate`：不可降级任务被错误路由到小模型比例
- `gate_passed`：综合门禁结果（质量不显著退化、延迟/成本不退化、不可降级任务不误路由）

## D-8.6 网络资源策略层质量评测

```bash
cd backend

# 运行网络资源策略评测（网页/音频/视频标准化 + 筛选去重 + 可引用性）
.venv-wsl/bin/python eval/network_resource_quality_audit.py \
  --dataset eval/network_resource_samples.json \
  --output eval/results/network_resource_latest.json

# 冻结首版网络资源质量基线
.venv-wsl/bin/python eval/network_resource_baseline.py freeze \
  --result eval/results/network_resource_latest.json \
  --output eval/baselines/network-resource-baseline-v1.json \
  --notes "D-8.6 network resource baseline v1"

# 后续改动后执行回归校验
.venv-wsl/bin/python eval/network_resource_baseline.py check \
  --current eval/results/network_resource_latest.json \
  --baseline eval/baselines/network-resource-baseline-v1.json
```

评测指标：
- `normalization_rate`：输出是否标准化为可入库知识单元
- `relevance_pass_rate`：排序后的高位结果是否与查询相关
- `low_quality_reject_rate`：低质量/弱相关资源是否被过滤
- `citation_ready_rate`：输出是否具备可直接引用字段（`chunk_id/source_type/filename/timestamp`）
- `gate_passed`：是否通过阈值门禁（支持 `thresholds` 配置）

## D-PS5 Project Space 质量门禁评测

```bash
cd backend

# 运行 Project Space 门禁评测（artifact 锚点 / candidate payload / 8 类能力闭环）
.venv-wsl/bin/python eval/project_space_quality_gate.py \
  --dataset eval/project_space_quality_samples.json \
  --output eval/results/project_space_quality_latest.json

# 冻结首版 Project Space 质量基线
.venv-wsl/bin/python eval/project_space_quality_baseline.py freeze \
  --result eval/results/project_space_quality_latest.json \
  --output eval/baselines/project-space-quality-baseline-v1.json \
  --notes "D-PS5 project space baseline v1"

# 后续改动后执行回归校验
.venv-wsl/bin/python eval/project_space_quality_baseline.py check \
  --current eval/results/project_space_quality_latest.json \
  --baseline eval/baselines/project-space-quality-baseline-v1.json
```

评测指标：
- `artifact_anchor_completeness_rate`：`artifact_id + based_on_version_id` 锚点完整率
- `candidate_payload_completeness_rate`：`candidate change` payload 必填字段完整率
- `capability_loop_pass_rate`：能力是否满足“可展示 + 可导出 + 可进历史 + 可提交候选变更”
- `citation_contract_pass_rate`：引用协议一致性通过率
- `capability_coverage_rate`：8 类能力覆盖率（`ppt/word/mindmap/outline/quiz/summary/animation/handout`）
- `capability_artifact_mapping_pass_rate`：能力到 Artifact 映射通过率（含 `outline/animation/handout` 的 `metadata.kind` 校验）
- `wave1_entry_semantics_pass_rate`：第一波能力入口语义通过率（`ppt/word/outline=session-first`，`summary=artifact-lite`）
- `gate_passed`：是否通过阈值门禁

## D-PS4 第一波入口语义审计

```bash
cd backend

# 审计第一波能力入口语义（session-first vs artifact-lite）
.venv-wsl/bin/python eval/project_space_wave1_entry_audit.py \
  --dataset eval/project_space_wave1_entry_samples.json \
  --output eval/results/project_space_wave1_entry_latest.json
```

评测指标：
- `contract_pass_rate`：入口语义契约通过率
- `gate_passed`：是否通过阈值门禁
- `failed_sample_ids` / `failed_reasons`：失败样本与原因
