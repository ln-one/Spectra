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
- 少量仓库噪音（缓存目录、系统文件、旧审计结论）
- 部分 legacy 契约与文档仍然保留
- 少数基础能力仍留在 `services/` 根目录

这意味着当前最合适的动作不是“全局大删”，而是：

- 先清最确定的垃圾
- 再给兼容层标记淘汰顺序
- 最后在第二阶段继续收紧边界

---

## 一、可立即删除

这些项目已经产生明确负担，且删除风险低。

### 1. 仓库内的无意义缓存与系统文件

文件：
- `/Users/ln1/Projects/Spectra/backend/archived/__pycache__/` 及同类缓存目录
- 仓库根目录或子目录中的 `.DS_Store`

现状：
- 旧归档测试本体已经删除，只剩缓存目录
- 当前仓库扫描已看不到需要继续保留的 `.DS_Store`，后续只需防止重新出现

理由：
- 无业务价值
- 只增加噪音

建议：
- 直接删除缓存目录
- 继续靠 `.gitignore` / 日常清理防止回流

---

## 二、可弃用保留

这些项目当前还有“桥接价值”，但已经不适合继续增长。

### 1. `backend/services/__init__.py`

文件：
- `/Users/ln1/Projects/Spectra/backend/services/__init__.py`

现状：
- 仍承担根级兼容导出
- 当前生产代码中的 `from services import ...` 已基本清零，主要剩文档和 guard 规则本身仍在提及该模式

判断：
- 现在不建议直接删
- 但它已经更明确地退化成“兼容层，不允许继续新增依赖”

冻结期动作：
- 统计是否还有测试或脚本依赖这些兼容别名
- 后续在不破坏 patch 习惯的前提下继续瘦身导出

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

### 3. 旧式 OpenAPI / deprecated 会话契约

文件：
- `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-core.yaml`
- `/Users/ln1/Projects/Spectra/docs/openapi/paths/generate-session-edit.yaml`

现状：
- 仍保留了一批 `deprecated: true` 的兼容 session 接口

判断：
- 当前仍有现实桥接价值
- 但不适合继续扩展

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

### 2. `quality_service/`

目录：
- `/Users/ln1/Projects/Spectra/backend/services/quality_service/`

现状：
- 已完成 package 化，不再是顶层单文件 warning
- 目前仍主要服务于 preview / quality 检查链路

判断：
- 不是冗余项
- 当前更像“已收口完毕、后续再决定更高层归属”的稳定模块

冻结期动作：
- 暂时保留当前位置
- 等后续决定是否合并进 `generation/` 或单独形成 `evaluation/` 再调整

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

1. 删除 `backend/archived/__pycache__/` 等无意义缓存目录
2. 继续瘦身 `backend/services/__init__.py` 的兼容导出
3. 给 legacy OpenAPI/旧接口列一份淘汰表，而不是继续默默保留
4. 继续梳理哪些基础能力应长期保留在 `services/` 根目录
5. 为 `docs/archived/` 补总索引，减少误用过期方案的成本

---

## 五、建议的下一步动作

### 第一批可以直接开做

1. 清理 `backend/archived/__pycache__/` 和后续新出现的仓库噪音文件
2. 补一份 `docs/legacy-surface-map.md`，标清仍在桥接中的 legacy surface
3. 评估 `backend/services/__init__.py` 的兼容别名使用面
4. 梳理 `services/` 根目录剩余基础能力的长期归属

### 第二批再做

1. 给 deprecated session 接口制定移除顺序
2. 为 `docs/archived/` 增加总索引和醒目标记
3. 在兼容层瘦身后同步更新 guard / standards / README

---

## 六、一句话结论

当前仓库确实已经出现了一批重构后的冗余层，但严重程度还没到“结构性失控”。

最现实的策略是：

- 先删最确定的垃圾
- 再标记兼容层淘汰顺序
- 最后配合冻结期重构逐步去掉桥接层

而不是现在就全仓无差别大删。
