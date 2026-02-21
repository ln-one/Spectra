# AI能力分析

> 负责人：成员D  
> 状态：✅ 已完成

## 目标

明确AI需要具备哪些能力，调研和选择合适的技术方案。

## 输出清单

- [x] [AI能力定义](./1.capabilities.md) - 五大核心能力与边界
- [x] [技术调研](./2.tech-research.md) - 实测选型报告
- [x] [知识库规划](./3.knowledge-base.md) - RAG 架构设计
- [x] [Prompt设计](./4.prompt-design.md) - 提示词策略

## 最终技术选型

| 模块 | 选型 | 备选 | 理由 |
|------|------|------|------|
| **LLM 大脑** | Qwen 3.5 | GPT-4 (fallback) | 中文语境最强，性价比最高 |
| **LLM 路由** | LiteLLM | - | 多模型统一接口，不使用 LangChain |
| **文档解析** | MinerU | LlamaParse | 可插拔设计，本地/云端均支持 |
| **向量数据库** | ChromaDB | → Milvus | 极简轻量，适合快速迭代 |
| **Embedding** | Qwen 3 Embedding | - | 国产开源标杆，中文语义匹配佳 |
| **课件生成** | Marp + Pandoc | - | 逻辑即排版，AI 友好 |
| **语音识别** | Faster-Whisper | - | 本地化部署，隐私友好 |
| **图片 OCR** | PaddleOCR | - | 中文识别准确 |
| **视频处理** | OpenCV | - | 关键帧提取 |
| **检索重排** | BGE-Reranker | - | 提升 RAG 召回精度 |

详细决策记录见：[技术决策 ADR](../../decisions/)

## 关键设计亮点

### 1. 五大 AI 能力
- 多模态意图深度解析
- 非结构化资料结构化重构
- 教育心理学教研规划
- 内容多端协同生成
- 增量式对话优化与记忆

### 2. 知识库架构（四层）
- 核心学科层：教材、大纲、题库
- 多模态素材层：视频指纹、图表索引
- 教研方法层：教学模型、互动策略
- 视觉资产层：PPT 组件、配色方案

### 3. Prompt 策略
- 角色注入（教学设计师人设）
- 思维链引导（CoT）
- 强制结构化输出（JSON）
- 动态提示词路由

## 参考文档

- [技术栈总览](../../project/tech-stack.md)
- [功能需求清单](../functional/feature-list.md)
- [系统边界](../functional/system-boundary.md)
- [技术决策 ADR](../../decisions/)
- `tech-research.md` - 技术调研（重点）
- `knowledge-base.md` - 知识库规划
- `prompt-design.md` - Prompt设计
