# RAG 优化说明

## 优化内容

### 1. Query Rewriting（查询改写）
- **文件**: `backend/services/rag_service/query_rewriter.py`
- **功能**: 将口语化查询改写为检索友好的关键词查询
- **示例**: 
  - 原查询: "这个项目的核心目标是什么"
  - 改写后: "项目目标 核心功能 背景 需求"

### 2. Cross-Encoder Reranking（重排序）
- **文件**: `backend/services/rag_service/reranker.py`
- **功能**: 使用 Cross-Encoder 模型对检索结果精排
- **模型**: `BAAI/bge-reranker-v2-m3`

### 3. 集成到检索流程
- **文件**: `backend/services/rag_service/retrieval.py`
- **修改点**:
  - 在 `search()` 函数中添加查询改写
  - 在结果返回前添加重排序逻辑

## 环境变量配置

```bash
# 启用 Cross-Encoder 重排序（默认开启）
RAG_ENABLE_CROSS_RERANK=true

# 启用原有的查询感知重排序（可选）
RAG_ENABLE_QUERY_RERANK=false
RAG_QUERY_BOOST_FACTOR=0.15
```

## 依赖安装

```bash
pip install sentence-transformers
```

## 预期效果

- **Top1 准确率**: 44.4% → 60%+
- **干扰项侵入率**: 35.2% → 20%-
- **MRR@1**: 0.44 → 0.55+

## 运行评测

```bash
cd backend
venv/Scripts/python.exe eval/run_eval.py \
  --project-id <project_id> \
  --dataset eval/dataset_d51_real_project_space.json \
  --output eval/results/optimized_latest.json \
  --baseline eval/results/query_boost_test.json
```
