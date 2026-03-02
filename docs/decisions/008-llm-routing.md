# ADR-008: LLM 路由策略 - LiteLLM（不使用 LangChain）

**状态**: 已接受 
**日期**: 2026-02-19

## 背景

需要选择 LLM 调用与路由方案，屏蔽不同模型厂商的 API 差异，实现模型不可知（Model Agnostic）架构。

## 考虑的方案

| 方案 | 优势 | 劣势 |
|------|------|------|
| **LiteLLM 单独使用** | 轻量、专注路由、学习成本低 | 无链式调用抽象 |
| LiteLLM + LangChain | 完整的链式调用、Agent 框架 | 过重、抽象层多、学习曲线陡 |
| 直接调用各厂商 SDK | 最大灵活性 | 维护成本高、切换模型困难 |

## 决策

**只使用 LiteLLM，不使用 LangChain**

## 理由

### LangChain 的问题
1. **过度抽象**：对于本项目场景，大部分抽象用不上
2. **学习曲线**：团队需要额外学习成本
3. **调试困难**：多层封装导致问题定位困难
4. **更新频繁**：API 经常变动，维护成本高

### LiteLLM 足够
1. **统一接口**：`completion()` 函数适配 100+ 模型
2. **模型路由**：内置 fallback、load balancing
3. **流式输出**：原生支持 streaming
4. **成本追踪**：内置 token 计数与成本计算

### 手写 Prompt 链路更可控

```python
# 简单直接的调用方式
from litellm import completion

async def generate_outline(intent: TeachingIntent) -> CourseOutline:
 response = await completion(
 model="qwen/qwen-plus",
 messages=[
 {"role": "system", "content": OUTLINE_SYSTEM_PROMPT},
 {"role": "user", "content": format_intent(intent)}
 ],
 response_format={"type": "json_object"}
 )
 return parse_outline(response)
 return CourseOutline.model_validate_json(response.choices[0].message.content)
```

对比 LangChain 的方式：

```python
# LangChain 方式 - 更复杂
from langchain.chains import LLMChain
from langchain.prompts import ChatPromptTemplate
from langchain.output_parsers import PydanticOutputParser

parser = PydanticOutputParser(pydantic_object=CourseOutline)
prompt = ChatPromptTemplate.from_messages([...])
chain = LLMChain(llm=llm, prompt=prompt, output_parser=parser)
result = await chain.arun(intent=intent)
```

## 架构设计

```
┌─────────────────────────────────────────┐
│ AI Service │
├─────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────────┐ │
│ │ LiteLLM │ │ Prompt Manager │ │
│ │ (路由层) │ │ (模板管理) │ │
│ └──────┬──────┘ └────────┬────────┘ │
│ │ │ │
│ ┌──────▼───────────────────▼────────┐ │
│ │ Business Logic │ │
│ │ - intent_parser.py │ │
│ │ - outline_generator.py │ │
│ │ - content_generator.py │ │
│ │ - revision_handler.py │ │
│ └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
 │
 ┌──────────┼──────────┐
 ▼ ▼ ▼
 [Qwen API] [GPT API] [Claude API]
```

## 模型配置

```python
# config/llm.py
from litellm import Router

router = Router(
 model_list=[
 {
 "model_name": "main",
 "litellm_params": {
 "model": "qwen/qwen-plus",
 "api_key": os.getenv("DASHSCOPE_API_KEY"),
 },
 },
 {
 "model_name": "main", # fallback
 "litellm_params": {
 "model": "gpt-4",
 "api_key": os.getenv("OPENAI_API_KEY"),
 },
 },
 ],
 fallbacks=[{"main": ["main"]}], # 自动 fallback
)
```

## 权衡

- 放弃 LangChain 的 Agent/Tool 抽象 → 本项目不需要复杂 Agent
- 需要手写部分链路代码 → 代码更可控、更易调试
- 未来扩展可能需要重构 → 当前阶段够用

## 影响

- 后端直接使用 LiteLLM 调用模型
- Prompt 模板以 Python 字符串或 Jinja2 管理
- 输出解析使用 Pydantic + JSON Schema
- 不引入 LangChain 依赖

## 参考

- [LiteLLM 文档](https://docs.litellm.ai/)
- [技术调研报告](../requirements/ai/2.tech-research.md)
