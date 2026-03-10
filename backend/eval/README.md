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
```

评测指标：
- `hit_rate`：有资料问题中，回答是否命中期望来源
- `misquote_rate`：回答引用错误来源的比例
- `no_hit_notice_rate`：无可用资料时是否明确提示“未命中资料”

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
