# AI 能力需求（精简版）

> 更新时间：2026-03-02

## 输出文件

- [能力定义](./1.capabilities.md)
- [技术调研](./2.tech-research.md)
- [知识库规划](./3.knowledge-base.md)
- [Prompt 设计](./4.prompt-design.md)

## 当前实现与规划边界

| 主题 | 当前 MVP | 规划方向 |
|---|---|---|
| LLM 调用 | LiteLLM + DashScope(Qwen) | 多模型路由增强 |
| 文档解析 | pypdf/docx/pptx 轻量解析 | 可插拔 MinerU/LlamaParse |
| RAG | ChromaDB 本地持久化 | 生产级向量库评估 |
| 视频/语音 | 未接入主流程 | Qwen-VL / Whisper 评估接入 |

## 使用规则

- “已落地”能力必须可在后端服务代码中定位。
- 技术选型变更先更新 ADR 和技术栈，再回写本目录。
- 需求分析文档以能力边界和验收条件为主，不堆叠实现细节。

## 关联文档

- [技术栈（MVP 对齐版）](../../architecture/tech-stack.md)
- [技术决策 ADR](../../decisions/README.md)
