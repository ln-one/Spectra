# 解析器可插拔架构 (Parser Providers)

> **关联决策**: [ADR-005 文档解析方案](../../../docs/decisions/005-document-parsing.md)  
> **OpenAPI 契约**: [files.yaml — parse_details](../../../docs/openapi/schemas/files.yaml)

## 概述

`services/parsers/` 提供可插拔的文档解析层，通过环境变量 `DOCUMENT_PARSER` 切换解析后端，上层调用方（`file_parser.py` / `rag_indexing_service.py`）**零感知**。

```
file_parser.py  ─→  get_parser()  ─→  BaseParseProvider
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
     LocalProvider  MinerUProvider  LlamaParseProvider
       (默认)        (预留)          (预留)
```

## Provider 切换

在 `.env` 中设置：

```bash
# 本地轻量解析（默认，无需额外依赖）
DOCUMENT_PARSER=local

# MinerU — 需安装 magic-pdf
DOCUMENT_PARSER=mineru

# LlamaParse — 需安装 llama-parse + 设置 LLAMAPARSE_API_KEY
DOCUMENT_PARSER=llamaparse
```

**Fallback 策略**（精准边界）：
- 仅在 **provider 不可用**（依赖缺失 / API Key 未配置）时自动回退到 `local`，日志输出警告。
- 解析执行失败（文件损坏、超时等）由 provider 自身返回空文本 + 详情，上层 `rag_indexing_service` 负责统一占位 fallback。

## 新增 Provider 标准步骤

1. 在 `services/parsers/` 下新建 `xxx_provider.py`，继承 `BaseParseProvider`：

   ```python
   from services.parsers.base import BaseParseProvider, ProviderNotAvailableError

   class XxxProvider(BaseParseProvider):
       name = "xxx"
       supported_types = {"pdf", "word", "ppt"}

       def __init__(self):
           try:
               import xxx_lib  # 检查依赖是否可用
           except ImportError:
               raise ProviderNotAvailableError("xxx_lib 未安装")

       def extract_text(self, filepath, filename, file_type):
           # 实现解析逻辑
           text = "..."
           details = {
               "pages_extracted": 0,
               "images_extracted": 0,
               "text_length": len(text),
           }
           return text, details
   ```

2. 在 `registry.py` 的 `_register_builtin_providers()` 中注册工厂函数：

   ```python
   def _make_xxx() -> BaseParseProvider:
       from .xxx_provider import XxxProvider
       return XxxProvider()

   _PROVIDER_FACTORIES["xxx"] = _make_xxx
   ```

3. 或通过外部注册（无需修改 registry 代码）：

   ```python
   from services.parsers import register_provider
   register_provider("xxx", lambda: XxxProvider())
   ```

4. `.env` / `.env.example` 新增 `DOCUMENT_PARSER=xxx`。

## `parse_details` 标准字段

与 [OpenAPI files.yaml](../../../docs/openapi/schemas/files.yaml) `parse_details` 对齐：

| 字段 | 类型 | 说明 | 适用类型 |
|------|------|------|----------|
| `pages_extracted` | `int` | 提取的页数 | PDF / Word / PPT |
| `images_extracted` | `int` | 提取的图片数 | 图片、含图文档 |
| `text_length` | `int` | 提取的文本长度（字符数） | 所有类型 |
| `duration` | `float` | 视频时长（秒） | 视频 |

> Provider 应**尽量**填充上述标准字段。未填充的字段不会导致错误，但会影响前端展示完整度。

## 文件说明

| 文件 | 职责 |
|------|------|
| `base.py` | 抽象基类 `BaseParseProvider` + 异常 `ProviderNotAvailableError` |
| `registry.py` | Provider 注册表、工厂函数 `get_parser()`、环境变量读取 |
| `local_provider.py` | 本地轻量解析（pypdf / python-docx / python-pptx） |
| `mineru_provider.py` | MinerU (Magic-PDF) 预留骨架 |
| `llamaparse_provider.py` | LlamaParse 云端 API 预留骨架 |
| `__init__.py` | 包导出：`get_parser`, `register_provider`, `BaseParseProvider`, `ProviderNotAvailableError` |
