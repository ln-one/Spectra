# D1 预研包（解析质量与路由策略）

## 版本信息
- 版本：v1.0-draft
- 日期：2026-03-05
- 负责人：成员 D

## 1. 解析样本池（已落地）
- 文件：`backend/eval/provider_sample_pool.json`
- 覆盖：`pdf/word/ppt` 三类基础样本
- 查询：每类样本至少 1 条关键词查询

## 2. 质量阈值（已落地）
- 文件：`backend/eval/provider_thresholds.json`
- 当前阈值：
  - `keyword_hit_rate_min = 0.7`
  - `avg_chunk_length_min = 20`
  - `avg_chunk_length_max = 1200`
  - `regression_threshold = 0.2`

## 3. 路由决策表（文档先行）

| 场景 | 首选路由 | 备选路由 | 触发回退条件 |
|---|---|---|---|
| PDF（结构复杂） | MinerU | LlamaParse / local | 超时、空文本、关键字段缺失 |
| Word（常规文本） | LlamaParse / local | MinerU | provider 不可用或文本长度异常 |
| PPT（标题+要点） | LlamaParse / local | MinerU | 页级提取失败、文本过短 |

> 说明：当前 C2 未完成真实接入，上表为策略草案，待联调后固化。

## 4. Harness 扩展（已落地）
- 文件：`backend/eval/provider_harness.py`
- 能力：
  - 加载样本池与阈值配置
  - 运行 `mock_high` / `mock_low` provider 对比
  - 输出回归检测结果与摘要

### 4.1 Harness 基线管理（已落地）
- 文件：`backend/eval/provider_harness_baseline.py`
- 能力：
  - `freeze`：冻结 `provider_harness` 评测结果为可追溯基线
  - `check`：按门禁阈值做回归退化检测
- 首版基线：`backend/eval/baselines/provider-harness-baseline-v1.json`

运行方式：
```bash
cd backend
.venv-wsl/bin/python eval/provider_harness.py \
  --sample-pool eval/provider_sample_pool.json \
  --thresholds eval/provider_thresholds.json \
  --output eval/results/provider_harness_latest.json

.venv-wsl/bin/python eval/provider_harness_baseline.py freeze \
  --result eval/results/provider_harness_latest.json \
  --output eval/baselines/provider-harness-baseline-v1.json

.venv-wsl/bin/python eval/provider_harness_baseline.py check \
  --current eval/results/provider_harness_latest.json \
  --baseline eval/baselines/provider-harness-baseline-v1.json
```

## 5. 后续对接点（给 C）
1. 将 `mock_high/mock_low` 替换为 `local/mineru/llamaparse` 真实 provider。
2. 按同一阈值文件执行回归对比，避免切换 provider 后静默退化。
3. 输出真实样本报告后，冻结 D1 最终阈值。
