# 04. 多模态资料进入、检索增强与证据组织

## 要解决的业务问题

如果资料进入、解析、检索和证据组织是零散脚本，系统就无法真正支撑多模态输入和可靠生成。

## 对应的产品能力与外化结果

- PDF / Word / 图片 / 视频等资料进入系统
- 多阶段解析与标准化
- 本地知识库 / RAG
- 证据组织后支撑生成与修改

## 采用的微服务与关键技术

- `Dualweave`：upload orchestration、remote parse entry、multi-stage delivery foundation
- `Stratumind`：retrieval / vector recall / evidence organization
- `Spectra Backend`：查询组织、timeout、结果整形

## 核心机制与实现路径

当前实现锚点：

- [backend/services/platform/dualweave_client.py](/Users/ln1/Projects/Spectra/backend/services/platform/dualweave_client.py)
- [backend/services/platform/dualweave_execution.py](/Users/ln1/Projects/Spectra/backend/services/platform/dualweave_execution.py)
- [backend/services/file_upload_service/dualweave_bridge.py](/Users/ln1/Projects/Spectra/backend/services/file_upload_service/dualweave_bridge.py)
- [backend/services/stratumind_client.py](/Users/ln1/Projects/Spectra/backend/services/stratumind_client.py)

检索正式边界锚点：

- [docs/competition/00-evidence-policy.md](/Users/ln1/Projects/Spectra/docs/competition/00-evidence-policy.md)
- [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)

## 当前代码/测试/产品面可以证明的现实

- `Dualweave` 已承担明确的上传编排与远端解析入口职责
- `Stratumind` 已承担正式 retrieval authority
- `Stratumind` 主展示数据只能使用最新正式集
- 第 5 章只保留检索增强的结论级数据；测试集构造、baseline、完整指标表和解释进入第 6 章
- `Dualweave` 的场景化 benchmark 只可用于说明评估方法和工程验证维度；没有正式最新报告前，不写具体性能提升倍数

测试锚点：

- [backend/tests/services/test_dualweave_client.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_dualweave_client.py)
- [backend/tests/services/test_dualweave_execution.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_dualweave_execution.py)
- [backend/tests/services/test_remote_parse.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_remote_parse.py)

正式展示数据锚点：

- `promoted60_raw_dense_topk`
- `promoted60_dense_only`
- `promoted60_advanced`
- `promoted105_raw_dense_topk`
- `promoted105_dense_only`
- `promoted105_advanced`

第 6 章应承接的证据内容：

- `Stratumind` 正式集构造：accepted-only promoted gold、60 题冻结里程碑、105 题三位数正式集
- `Stratumind` baseline 设计：`raw_dense_topk`、`dense_only`、`advanced`
- `Stratumind` 指标解释：Hit@3、MRR@3、Evidence Hit、Evidence MRR、Keyword、Quality、Avg latency
- `Dualweave` 评估维度：request return P50/P95/P99、happy-path completion、pending remote ratio、replay convergence、backlog high watermark、capacity rejects
- `Dualweave` 披露边界：只讲系统位置、工程价值、场景化验证和可观测性，不披露可直接复刻的策略细节

## 本节 Mermaid 图

- 图 5-6：多模态资料进入与证据组织图

## 本节写作禁区与披露边界

- 不重新引用旧垃圾质量指标
- 不泄露 `Dualweave` 可直接复刻的关键机制
- 不把 `Stratumind` 写成“只是向量搜索”
