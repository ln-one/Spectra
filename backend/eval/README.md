# RAG 评测系统

## 目录结构

```
eval/
├── dataset.json        # 评测数据集（10 条教育场景用例）
├── metrics.py          # 指标计算：hit_rate, MRR, keyword_hit_rate, latency, failure_rate
├── run_eval.py         # 评测脚本入口
├── baseline_manager.py # 基线冻结/回归校验工具
├── baselines/          # 提交到仓库的基线快照
├── results/            # 评测结果输出（gitignore）
└── README.md
```

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
- `explainability_rate` 最多下降 `2%`
- `continuity_rate` 最多下降 `2%`
- `fallback_hit_rate` 最多下降 `5%`
- hard floor: `explainability_rate >= 95%`、`continuity_rate >= 95%`

## 指标说明

| 指标 | 说明 |
|------|------|
| `keyword_hit_rate` | 结果内容包含期望关键词的用例比例（主要指标，无需 ground-truth） |
| `hit_rate@k` | 前 k 个结果命中相关 chunk 的比例（需标注 relevant_chunk_ids） |
| `mrr@k` | Mean Reciprocal Rank（需标注 relevant_chunk_ids） |
| `avg_latency_ms` | 平均检索延迟（毫秒） |
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

## D4 来源质量抽样评测（先行版）

```bash
cd backend

# 运行来源质量评测（基于 RAGSearch/SourceDetail/Preview sources 字段）
.venv-wsl/bin/python eval/source_quality_audit.py \
  --dataset eval/source_audit_samples.json \
  --output eval/results/source_audit_latest.json
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
```

评测指标：
- `normalization_rate`：输出是否标准化为可入库知识单元
- `relevance_pass_rate`：排序后的高位结果是否与查询相关
- `low_quality_reject_rate`：低质量/弱相关资源是否被过滤
- `citation_ready_rate`：输出是否具备可直接引用字段（`chunk_id/source_type/filename/timestamp`）

## D-PS5 Project Space 质量门禁评测

```bash
cd backend

# 运行 Project Space 门禁评测（artifact 锚点 / candidate payload / 8 类能力闭环）
.venv-wsl/bin/python eval/project_space_quality_gate.py \
  --dataset eval/project_space_quality_samples.json \
  --output eval/results/project_space_quality_latest.json
```

评测指标：
- `artifact_anchor_completeness_rate`：`artifact_id + based_on_version_id` 锚点完整率
- `candidate_payload_completeness_rate`：`candidate change` payload 必填字段完整率
- `capability_loop_pass_rate`：能力是否满足“可展示 + 可导出 + 可进历史 + 可提交候选变更”
- `citation_contract_pass_rate`：引用协议一致性通过率
- `capability_coverage_rate`：8 类能力覆盖率（`ppt/word/mindmap/outline/quiz/summary/animation/handout`）
- `gate_passed`：是否通过阈值门禁
