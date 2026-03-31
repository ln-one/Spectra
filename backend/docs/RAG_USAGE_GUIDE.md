# RAG 检索结果使用说明

## 重要提示

RAG 模块已有完整的后处理管道（去重、压缩、证据提取），但不同接口返回内容不同。

---

## 接口分类

### ✅ 已处理（可直接用于 LLM）

以下接口返回的内容已经过后处理，可直接拼接到 LLM prompt：

- `services/ai/rag_context.py` 的 `retrieve_rag_context()`
- `routers/chat/message_flow.py` 的 `load_rag_context()`

**返回格式**：
```python
[
    {
        "chunk_id": "...",
        "content": "...",  # 已去重、压缩、提取关键句
        "score": 0.85,
        "source": {...}
    }
]
```

---

### ❌ 原始结果（需自行处理）

以下接口返回原始 `RAGResult`，未经后处理：

- `rag_service.search()` 直接调用
- `/api/rag/search` HTTP 接口

**返回格式**：
```python
[
    RAGResult(
        chunk_id="...",
        content="...",  # 原始 chunk，可能重复/冗长
        score=0.85,
        source=SourceReference(...),
        metadata={...}
    )
]
```

---

## 如何处理原始结果

如果你直接调用 `rag_service.search()` 或使用 `/api/rag/search`，需要手动调用后处理：

```python
from services.rag_service.context_postprocess import postprocess_rag_context

# 1. 获取原始结果
results = await rag_service.search(
    project_id=project_id,
    query=query,
    top_k=5,
)

# 2. 序列化
serialized = [r.model_dump() for r in results]

# 3. 后处理
processed, diagnostics = await postprocess_rag_context(
    query=query,
    rag_results=serialized,
)

# 4. processed 可直接用于 LLM prompt
```

---

## 后处理功能

`postprocess_rag_context` 包含：

1. **智能去重**：过滤近似重复的 chunk（Jaccard + 字符串相似度）
2. **内容压缩**：
   - `rule` 模式：基于规则提取关键句
   - `llm` 模式：调用 LLM 压缩
   - `hybrid` 模式：规则 + LLM 结合
3. **证据提取**：提取与查询最相关的句子
4. **质量评分**：过滤低质量内容

---

## 配置项

### 环境变量

```bash
# 启用去重（默认 true）
ENABLE_CONTEXT_DEDUP=true

# 启用压缩（默认 true）
ENABLE_CONTEXT_COMPRESSION=true

# 压缩模式（默认 rule）
RAG_CONTEXT_COMPRESSION_MODE=rule  # rule | llm | hybrid

# 最大证据块数量（默认 5）
MAX_EVIDENCE_CHUNKS=5

# 每块最大句子数（默认 3）
MAX_SENTENCES_PER_CHUNK=3

# 去重相似度阈值（默认 0.82）
RAG_DEDUP_THRESHOLD=0.82
```

### Feature Flags

也可通过系统配置的 `feature_flags` 动态控制：

```json
{
  "enable_context_dedup": true,
  "enable_context_compression": true,
  "compression_mode": "rule"
}
```

---

## 性能影响

- **去重**：~50-100ms
- **规则压缩**：~10-30ms
- **LLM 压缩**：~500-2000ms（取决于 LLM 延迟）

建议：
- 生产环境默认用 `rule` 模式
- 对质量要求极高的场景用 `hybrid` 模式
- 避免全局启用 `llm` 模式（延迟高）

---

## 相关文档

- `backend/eval/RAG_OPTIMIZATION_TECHNIQUES.md` - RAG 优化技术详解
- `backend/services/rag_service/context_postprocess.py` - 后处理实现
- `backend/services/ai/rag_context.py` - AI Service 集成示例
