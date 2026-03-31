# Eval 目录结构说明

## 1. 目标

`backend/eval` 用于承载 Spectra 的评测、基线和回归门禁能力。

本目录当前仍保持扁平文件布局，原因是：

- 现有脚本路径已经被 README、命令行和历史基线广泛引用
- 直接大规模移动文件会带来额外迁移成本

因此本次整理采用的是**逻辑分组明确、物理路径兼容保留**的方式。

## 2. 逻辑分组

### 2.1 RAG 检索评测

- `run_eval.py`
- `metrics.py`
- `baseline_manager.py`
- `relevant_chunk_resolver.py`
- `dataset*.json`

职责：
- 评测 RAG 检索质量
- 输出强指标
- 冻结基线并执行回归门禁

### 2.2 来源与引用质量

- `source_quality_audit.py`
- `source_quality_baseline.py`
- `citation_quality_audit.py`
- `source_audit_samples.json`
- `citation_audit_samples.json`

职责：
- 评测来源是否可追溯
- 评测引用协议是否稳定

### 2.3 对话记忆与 RAG 消费质量

- `dialogue_memory_audit.py`
- `dialogue_memory_samples*.json`

职责：
- 评测聊天链路是否正确消费资料

### 2.4 大纲与生成流程质量

- `outline_flow_audit.py`
- `outline_quality_audit.py`
- `outline_quality_baseline.py`
- `outline_*_samples.json`

职责：
- 评测大纲初稿、重写、确认和重复问题

### 2.5 PPT 质量专项

- `ppt_quality_*.py`
- `ppt_image_quality_*.py`
- `ppt_*_samples.json`

职责：
- 评测 PPT 结构、表达、图文关系、插图质量

### 2.6 模型路由与 Provider 质量

- `provider_harness.py`
- `provider_harness_baseline.py`
- `provider_comparison.py`
- `router_quality_audit.py`
- `router_quality_baseline.py`
- `provider_*`
- `router_*`

职责：
- 评测模型选择、Provider 回退和质量门禁

### 2.7 Project Space 语义门禁

- `project_space_quality_gate.py`
- `project_space_quality_baseline.py`
- `project_space_wave1_entry_audit.py`
- `project_space_*_samples.json`

职责：
- 评测 Project / Session / Artifact 语义闭环

## 3. 当前推荐结构约定

后续新增评测能力时，建议遵循以下命名规范：

### 3.1 脚本

- `<domain>_audit.py`
- `<domain>_baseline.py`
- `<domain>_comparison_audit.py`

### 3.2 数据集

- `<domain>_samples.json`
- `<domain>_comparison_samples.json`
- `dataset_<scope>.json` 仅保留给通用 RAG 检索数据集

### 3.3 文档

- `README.md`：目录总入口
- `<DOMAIN>_*.md`：某一评测专题的设计说明

## 4. 为什么暂不直接拆子目录

当前不直接改成：

- `eval/rag/`
- `eval/ppt/`
- `eval/project_space/`

主要是因为：

1. 现有命令行、文档、历史结果路径全部依赖当前路径
2. 比赛准备阶段更应优先保证可运行和可解释，而不是引入大规模路径迁移
3. 逻辑结构先明确后，再做物理迁移更稳

## 5. 后续可接受的下一步

如果后续评测继续扩张，可以分两步走：

1. 先保持脚本名不变，新增分组文档和统一入口
2. 再在版本窗口中统一迁移到子目录，并同步修正 README、命令和 baseline 路径
