# RAG 评测系统

## 目录结构

```
eval/
├── dataset.json        # 评测数据集（10 条教育场景用例）
├── metrics.py          # 指标计算：hit_rate, MRR, keyword_hit_rate, latency, failure_rate
├── run_eval.py         # 评测脚本入口
├── results/            # 评测结果输出（gitignore）
└── README.md
```

## 快速使用

```bash
cd backend
# 运行评测（需要真实项目 ID 和已索引文档）
venv/Scripts/python.exe eval/run_eval.py --project-id <project_id>

# 指定 top_k 和输出路径
venv/Scripts/python.exe eval/run_eval.py --project-id <id> --top-k 3 --output eval/results/run1.json

# 与基线对比
venv/Scripts/python.exe eval/run_eval.py --project-id <id> --baseline eval/results/baseline.json
```

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
