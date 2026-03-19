# 冗余审计报告

## 审计日期

- 2026-03-19

## 目标

在冻结期开始阶段，先区分当前仓库中的“真冗余”和“过渡兼容层”，避免一上来误删仍有价值的桥接代码。

本报告把发现项分成三类：

1. 可立即删除
2. 可弃用保留
3. 暂时保留

---

## 总体判断

当前项目的主要问题已经不再是“超大单文件”，而是：

- 第一轮重构后留下的兼容出口
- 旧时代归档脚本/测试仍在仓库中
- 少量仅为测试 patch 服务的 wrapper
- 部分 legacy 契约与文档仍然保留

这意味着当前最合适的动作不是“全局大删”，而是：

- 先清最确定的垃圾
- 再给兼容层标记淘汰顺序
- 最后在第二阶段继续收紧边界

---

## 一、可立即删除

这些项目已经产生明确负担，且删除风险低。

### 1. `backend/archived/` 下的旧测试脚本

文件：
- `/Users/ln1/Projects/Spectra/backend/archived/test_generation_standalone.py`
- `/Users/ln1/Projects/Spectra/backend/archived/test_phase2a_generation.py`
- `/Users/ln1/Projects/Spectra/backend/archived/test_phase2b_simple.py`
- `/Users/ln1/Projects/Spectra/backend/archived/test_chroma.py`
- `/Users/ln1/Projects/Spectra/backend/archived/test_phase2b_e2e.py`
- `/Users/ln1/Projects/Spectra/backend/archived/test_phase2b_api.py`
- `/Users/ln1/Projects/Spectra/backend/archived/test_chroma_multi.py`

理由：
- 它们依赖已经迁移或消失的旧路径，例如 `services.generation_service`、`services.template_service`
- 直接运行 `pytest backend -q` 会被这些归档旧测试打断
- 当前主测试套已经不依赖它们

建议：
- 冻结期直接删除
- 如果确实想留历史样例，转为纯文档或搬到 `docs/archived/`

### 2. 仓库内的无意义系统文件

文件：
- `/Users/ln1/Projects/Spectra/docs/openapi/.DS_Store`
- `/Users/ln1/Projects/Spectra/backend/archived/__pycache__/` 及同类缓存目录

理由：
- 无业务价值
- 只增加噪音

建议：
- 直接删除
- 同时补 `.gitignore` / 清理缓存

---

## 二、可弃用保留

这些项目当前还有“桥接价值”，但已经不适合继续增长。

### 1. `backend/services/__init__.py`

文件：
- `/Users/ln1/Projects/Spectra/backend/services/__init__.py`

现状：
- 仍承担根级兼容导出
- 生产代码里还残留少量通过它做延迟取模块的用法

证据：
- 生产代码仍有：
  - `/Users/ln1/Projects/Spectra/backend/services/ai/service.py`
  - `/Users/ln1/Projects/Spectra/backend/services/task_executor/generation_error_handling.py`
  - `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/task_runtime.py`

判断：
- 现在不建议直接删
- 但应标记为“兼容层，不允许继续新增依赖”

冻结期动作：
- 清掉剩余生产代码中的 `from services import ...`
- 等生产代码完全脱离后，再考虑精简导出

### 2. `backend/routers/__init__.py`

文件：
- `/Users/ln1/Projects/Spectra/backend/routers/__init__.py`

现状：
- 用 lazy import 方式保留 router 根出口

判断：
- 目前不是问题根源
- 但本质上也是兼容层

冻结期动作：
- 暂不删除
- 后续统一 app 装配层时再评估是否仍需要根级 router 聚合出口

### 3. `generate_sessions/shared.py` 里的测试兼容 wrapper

文件：
- `/Users/ln1/Projects/Spectra/backend/routers/generate_sessions/shared.py`

具体函数：
- `build_session_artifact_anchor(...)`
- `without_sources(...)`
- `load_session_preview_material(...)`

现状：
- 主要是“给测试 patch 和旧调用习惯兜底”的薄 wrapper

判断：
- 暂时有用
- 但属于典型“可弃用保留”项

冻结期动作：
- 先统计测试是否仍需要 patch 这些名字
- 如果测试可以直接 patch 新函数，下一轮可删

### 4. `generate-session` 的 deprecated 兼容接口契约

文件：
- `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-core.yaml`
- `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-edit.yaml`

现状：
- 仍保留了一批 `deprecated: true` 的兼容 session 接口

判断：
- 这些目前仍有现实价值，因为前后端和测试还可能依赖
- 但应该进入淘汰清单，不再继续扩展

冻结期动作：
- 列出仍被谁调用
- 逐步收敛到统一 command / session-first 主入口

---

## 三、暂时保留

这些项目看起来“有点旧”，但当前不建议贸然处理。

### 1. `docs/openapi/schemas/generate-legacy.yaml`

文件：
- `/Users/ln1/Projects/Spectra/docs/openapi/schemas/generate-legacy.yaml`
- `/Users/ln1/Projects/Spectra/docs/openapi/schemas/generate.yaml`

现状：
- `generate.yaml` 仍显式引用 `generate-legacy.yaml`

判断：
- 现在不是简单“废文件”
- 删除会直接影响 OpenAPI bundle

冻结期动作：
- 先梳理是否还需要兼容旧生成任务契约
- 在 legacy API 真正移除前暂时保留

### 2. `quality_service.py`

文件：
- `/Users/ln1/Projects/Spectra/backend/services/quality_service.py`

现状：
- 仍是顶层单文件
- 被 `test_phase4_preview` 等路径使用

判断：
- 它不是明显死代码
- 目前更像“归属待定模块”，不是应立即删除的冗余

冻结期动作：
- 保留
- 等后续决定归入 `generation`、`platform` 或 `evaluation` 再收口

### 3. `generation_session_service/helpers.py`

文件：
- `/Users/ln1/Projects/Spectra/backend/services/generation_session_service/helpers.py`

现状：
- 本身很薄，只做 re-export

判断：
- 它有一点“中转层味道”
- 但在模块还没完全稳定前，保留一个清晰 helper 出口是可接受的

冻结期动作：
- 暂保留
- 等 helper 使用路径再稳定后评估是否继续拆散或合并

### 4. `docs/archived/`

目录：
- `/Users/ln1/Projects/Spectra/docs/archived/`

现状：
- 共有 66 个归档文档

判断：
- 文档归档本身没有问题
- 这里的主要风险不是“占空间”，而是新人误用过期方案

冻结期动作：
- 不删大多数内容
- 但要补一个总索引，标清“仅历史参考，不代表当前结构”

---

## 四、当前最值得优先清理的点

按收益 / 风险比排序：

1. 删除 `backend/archived/` 旧测试脚本
2. 删除 `.DS_Store`、`__pycache__` 等无意义文件
3. 统计并收缩 `generate_sessions/shared.py` 的测试兼容 wrapper
4. 继续清生产代码里的 `from services import ...`
5. 给 legacy OpenAPI/旧接口列一份淘汰表，而不是继续默默保留

---

## 五、建议的下一步动作

### 第一批可以直接开做

1. 清理 `backend/archived/` 测试
2. 清理仓库噪音文件
3. 补一份 `docs/legacy-surface-map.md`
4. 清生产代码中的剩余 `from services import ...`

### 第二批再做

1. 清 `generate_sessions/shared.py` 的兼容 wrapper
2. 评估 `services/__init__.py` 的精简方案
3. 给 deprecated session 接口制定移除顺序

---

## 六、一句话结论

当前仓库确实已经出现了一批重构后的冗余层，但严重程度还没到“结构性失控”。

最现实的策略是：

- 先删最确定的垃圾
- 再标记兼容层淘汰顺序
- 最后配合冻结期重构逐步去掉桥接层

而不是现在就全仓无差别大删。
