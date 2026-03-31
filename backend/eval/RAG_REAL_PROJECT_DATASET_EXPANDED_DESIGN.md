# RAG 真实项目扩展数据集设计说明

## 1. 目的

本数据集用于评测 Spectra 在真实项目语境下的 RAG 检索质量。

相比现有的 `dataset_d51_real_project_space.json`，扩展版数据集覆盖范围更大，问题类型更完整，适合用于以下场景：

- 本地 API 模式下的真实项目评测
- RAG 检索回归测试
- 需求文档导向的关键词命中率对比
- 后续 Studio 推荐词、主题建议、生成链路的上游检索质量抽样

### 1.1 语义边界

本设计文档中出现的：

- `required_facts`
- `relevant_chunk_ids`
- `usable_chunk_ids`
- `usable_top1_rate`
- `usable_top3_rate`
- `distractor_intrusion_rate`

都属于 `backend/eval` 的评测语义。

它们用于表达“检索结果是否足够回答问题、是否足够支撑下游生成”，不属于 `project-space` 的运行时领域模型，也不应被解释为 `Project / Session / Artifact / Reference / Version / CandidateChange` 的产品语义扩展。

## 2. 适用范围

本数据集当前主要基于以下文档设计：

- `docs/project/requirements.md`

评测目标是验证系统是否能够从真实项目需求中检索出稳定、可回溯、语义正确的知识片段。

本数据集暂不直接用于验证：

- 前端推荐词抽取质量
- 最终 PPT 或 Word 生成质量
- 引用标注质量

这些能力依赖额外的下游处理，不应与基础 RAG 检索混测。

## 3. 设计原则

### 3.1 问题必须贴近真实项目语义

问题不使用泛教育样本，不使用脱离项目上下文的通用学科问答，而是围绕真实需求文档中的目标、功能、技术要求、价值和交付材料设计。

### 3.2 从相关性评测升级到可用性评测

当前数据集不再只服务于：

- `keyword_hit_rate`
- `hit_rate@k`
- `MRR`

还需要支撑更严格的“可用性评测”，因此每条样本应尽量具备：

- `required_facts`
- `relevant_chunk_ids`
- `usable_chunk_ids` 或 `usable_source_contains`

目标不是只证明“检到了相关词”，而是证明：

- Top1 是否已经可直接使用
- Top3 是否足以回答问题
- 结果是否覆盖了 query 的必备事实点
- 是否存在高位噪声挤占

### 3.3 保持与脚本兼容

数据集保留 `run_eval.py` 直接消费所需字段：

- `id`
- `query`
- `expected_keywords`
- `relevant_chunk_ids`
- `category`
- `difficulty`

同时允许附加字段：

- `source_doc`
- `source_section`
- `notes`

这些附加字段不会影响现有脚本执行，但可以帮助人工校对和后续扩展。

## 4. 覆盖维度

扩展版数据集按以下维度组织：

1. 项目背景
2. 项目目标
3. 教师意图理解
4. 多模态资料融合
5. 课件初稿生成
6. 迭代优化闭环
7. 本地知识库 RAG
8. 多模态需求输入界面
9. 教学意图理解与知识融合模块
10. 多模态课件生成引擎
11. 导出与预览
12. 技术约束与提交材料
13. 项目价值

这样设计的目的，是避免评测只集中在少数高频主题，导致结果对真实能力覆盖不足。

## 5. 使用方式

推荐通过 API 模式运行：

```bash
cd backend
venv/Scripts/python.exe eval/run_eval.py \
  --project-id <project_id> \
  --dataset eval/dataset_d51_real_project_space_expanded.json \
  --api-base-url http://127.0.0.1:8011/api/v1 \
  --api-email <spectra_email> \
  --api-password <spectra_password> \
  --output eval/results/d51_real_project_expanded_latest.json
```

## 6. 结果解读建议

### 6.1 当前优先看什么

优先看：

- `usable_top1_rate`
- `usable_top3_rate`
- `fact_coverage_rate`
- `distractor_intrusion_rate`
- `hit_rate@3`
- `nDCG@5`

基础稳定性指标仍然要看：

- `failure_rate`
- `avg_latency_ms`
- `p95_latency_ms`

### 6.2 什么结果值得警惕

以下情况需要重点排查：

- `failure_rate > 0`
- `usable_top1_rate` 明显低于 `usable_top3_rate`
- `fact_coverage_rate` 偏低，说明检到但答不全
- `distractor_intrusion_rate` 偏高，说明高位排序被噪声污染
- `p95_latency_ms` 异常升高，说明尾延迟不可控

## 7. 已知限制

1. 当前数据集主要围绕 `requirements.md`，未覆盖全部产品文档。
2. 如果 `usable_chunk_ids` 仍主要由 `relevant_chunk_ids` 退回获得，可用性指标的严格性仍受限。
3. 如果项目资料未包含对应需求文档，命中率会自然偏低。
4. 如果走本地直连模式而非 API 模式，可能因为本地 Chroma/数据库环境不一致导致结果失真。

## 8. 后续扩展建议

下一步可以继续补三类数据：

1. `project-space` 语义数据集  
用于验证 `Project / Session / Artifact / Version / CandidateChange / Reference` 相关检索质量。

2. Studio 推荐词专项数据集  
用于验证 `rag/search -> 推荐词抽取 -> 前端展示` 的质量。

3. 生成链路 grounding 数据集  
用于验证大纲、知识点、PPT 内容是否真正引用 RAG 命中结果。

## 9. 推荐字段

建议未来所有真实项目样本逐步补齐以下字段：

```json
{
  "required_facts": ["教学目标", "教学过程", "教学方法"],
  "relevant_chunk_ids": [],
  "relevant_source_contains": ["生成与PPT配套的详细教案"],
  "usable_chunk_ids": [],
  "usable_source_contains": ["生成与PPT配套的详细教案，包括教学目标、教学过程、教学方法"],
  "usable_min_fact_coverage": 0.5,
  "fact_top_k": 3
}
```

字段含义：

- `required_facts`：回答该 query 必须覆盖的事实点
- `relevant_chunk_ids`：相关证据块
- `usable_chunk_ids`：不仅相关，而且单块即可支撑回答的问题证据块
- `usable_min_fact_coverage`：判定“可用”时的最低事实覆盖比例
- `fact_top_k`：计算事实覆盖率时使用的结果深度
