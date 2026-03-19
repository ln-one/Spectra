# Legacy Surface Map

## 更新日期

- 2026-03-19

## 目的

这份文档用来标出当前仓库里仍然保留的 legacy / compatibility surface，方便冻结期后续做有计划的瘦身，而不是靠搜索逐个猜测。

这里记录的对象，不代表“应该立刻删除”，而是表示：

- 仍有桥接价值
- 应避免继续扩展
- 后续需要单独评估移除顺序

---

## 1. Root Compatibility Packages

### `/Users/ln1/Projects/Spectra/backend/services/__init__.py`

作用：
- 为旧式 `from services import ...` 提供 lazy compatibility export

当前导出：
- `AIService`
- `ai_service`
- `DatabaseService`
- `db_service`
- `EmbeddingService`
- `embedding_service`
- `FileService`
- `file_service`
- `PromptService`
- `prompt_service`
- `RAGService`
- `rag_service`
- `VectorService`
- `vector_service`
- `rag_indexing`
- `rag_indexing_service`

当前判断：
- 生产代码主路径已经基本摆脱这层兼容导出
- 但测试 patch、局部脚本和外部习惯调用仍可能依赖

后续处理建议：
1. 统计测试和脚本的真实使用面
2. 先收缩 alias，再减少导出集合
3. 最后只保留极少数必要桥接，或彻底移除

### `/Users/ln1/Projects/Spectra/backend/routers/__init__.py`

作用：
- 当前只作为 `routers` 包命名空间存在，支持 `import routers.<module>` 风格导入

当前判断：
- 生产代码已经不再依赖这里的聚合导出
- lazy export 已移除，剩下的是极薄兼容壳

后续处理建议：
1. 继续把测试和外部工具从 `import routers.<module>` 迁到更直接的模块路径（如适用）
2. 等确认没有外部依赖后，再评估是否彻底移除该兼容壳

---

## 2. Re-export Helper Layers

### `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/helpers.py`

作用：
- 把分散在多个 helper 模块中的函数重新汇总成单出口

当前 re-export 分组：
- outline helpers
- capability helpers
- serialization helpers

当前判断：
- 它不是坏味道最重的一层
- 但本质上是稳定化阶段保留的中转层

后续处理建议：
1. 先统计是否仍有测试/模块依赖统一 helper 出口
2. 如果依赖面很小，可在后续收紧成显式模块导入

---

## 3. Deprecated OpenAPI Surface

### `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-core.yaml`

仍保留的 deprecated 接口：
- `POST /generate/requirements`

### `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-edit.yaml`

仍保留的 deprecated 接口：
- `POST /generate/preview`
- `POST /generate/modify`
- `POST /generate/export`
- `POST /generate/confirm-outline`

当前判断：
- 它们还在 OpenAPI 中，说明目前仍承担兼容职责
- 这些接口不应继续扩展，只应维持桥接并逐步淘汰

后续处理建议：
1. 确认前端、测试、脚本是否仍直接调用这些路径
2. 为每个 deprecated 路径指定 replacement
3. 在完成迁移后，从 OpenAPI source/target 中移除

---

## 4. Legacy Schema Bridge

### `/Users/ln1/Projects/Spectra/docs/openapi/schemas/generate-legacy.yaml`

作用：
- 仍被 `/Users/ln1/Projects/Spectra/docs/openapi/schemas/generate.yaml` 引用

当前判断：
- 这不是废文件
- 它仍是 OpenAPI bundle 的一部分

后续处理建议：
1. 梳理 legacy schema 还有哪些路径仍引用
2. 等 deprecated 生成接口真正移除后再清理

---

## 5. Remaining Root-Level Service Primitives

当前仍留在 `/Users/ln1/Projects/Spectra/backend/services/` 根目录的文件：
- `/Users/ln1/Projects/Spectra/backend/services/auth_service.py`
- `/Users/ln1/Projects/Spectra/backend/services/capability_health.py`
- `/Users/ln1/Projects/Spectra/backend/services/chunking.py`
- `/Users/ln1/Projects/Spectra/backend/services/file.py`

当前判断：
- 这些更像基础能力或公共原语
- 目前不属于“必须马上迁走”的 legacy surface
- 但后续应明确哪些会长期留在根目录，哪些要进入 `platform/` 或其他分区

后续处理建议：
1. 给每个文件补长期归属判断
2. 保持根目录只容纳真正基础、低依赖、通用的能力

---

## 一句话结论

当前真正需要关注的 legacy surface，主要集中在：
- `services/__init__.py`
- `routers/__init__.py`
- `generation_session_service/helpers.py`
- deprecated generate-session OpenAPI paths
- `generate-legacy.yaml`

下一阶段不需要“大清仓”，而是要按这张图逐步缩小桥接面。
