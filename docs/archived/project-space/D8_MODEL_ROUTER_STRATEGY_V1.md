# D-8.4 模型路由策略 V1

更新时间：2026-03-17  
范围：成员 D（路由规则/映射/回退语义），不包含基础执行通道接线

## 1. 目标

- 为 `ai_service.generate(...)` 提供稳定、可审计的任务路由策略。
- 将任务分层为 `light / adaptive / heavy`，减少延迟和成本，同时守住关键任务质量。
- 输出可复用的任务映射表与回退规则，供 D-8.5 门禁评测复现。

## 2. 任务分层与映射

当前实现位置：`backend/services/ai/model_router.py`

| route_task | complexity | 默认模型层级 | fallback 层级 | 规则 |
|---|---|---|---|---|
| `intent_classification` | `light` | light | heavy | `lightweight_task` |
| `title_polish` | `light` | light | heavy | `lightweight_task` |
| `outline_formatting` | `light` | light | heavy | `lightweight_task` |
| `short_text_polish` | `light` | light | heavy | `lightweight_task` |
| `chat_response` | `adaptive` | adaptive | heavy | `chat_with_rag_context` / `chat_prompt_too_long` / `chat_lightweight` |
| `rag_deep_summary` | `heavy` | heavy | heavy | `reasoning_or_rag_heavy_task` |
| `lesson_plan_reasoning` | `heavy` | heavy | heavy | `reasoning_or_rag_heavy_task` |
| `preview_modification` | `heavy` | heavy | heavy | `reasoning_or_rag_heavy_task` |

说明：
- `adaptive` 任务仅用于 `chat_response`。当 `has_rag_context=true` 或 prompt 过长时走 heavy；否则走 light。
- 未知任务默认回退 heavy，避免关键任务误降级。

## 3. 回退语义

- 若路由到 light 模型后调用失败，`AIService` 自动回退到 heavy 模型。
- 回退时返回：
  - `route.fallback_triggered=true`
  - `route.original_model`
  - `route.failure_reason`
- 关键任务（`rag_deep_summary / lesson_plan_reasoning / preview_modification`）默认不降级到 light。

## 4. Prompt 兼容性约束

- 路由策略不改变 prompt 协议本身，只改变模型选择。
- `chat_response` 与 `short_text_polish` 的 prompt 风格需保持一致，避免回退前后语气漂移。
- 含 RAG 上下文的任务必须显式传入 `has_rag_context`，否则会影响 adaptive 判定。

## 5. 与 D-8.5 的接口

- D-8.5 门禁脚本基于同一套 `route_task` 与规则评估：
  - 质量差异（`quality_delta`）
  - 延迟优化（`latency_reduction_rate`）
  - 成本优化（`cost_reduction_rate`）
  - 不可降级误路由（`non_degradable_misroute_rate`）
  - 回退触发率（`fallback_rate`）
