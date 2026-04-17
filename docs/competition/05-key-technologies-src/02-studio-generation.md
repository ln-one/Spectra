# 02. Studio 多模态内容工坊与生成主链

## 要解决的业务问题

教师真实工作不是“吐出一份 PPT”，而是围绕同一门课完成意图表达、材料组织、初稿生成、预览修改和多模态成果派生。

## 对应的产品能力与外化结果

本组必须覆盖并正写：

- `PPT`
- `Word 教案`
- `互动小测`
- `互动游戏`
- `思维导图`
- `演示动画`
- `说课助手`
- `学情预演`

这些都要写成同一课程知识空间的不同外化切面，而不是零散附加功能。

## 采用的微服务与关键技术

- `Spectra Backend`：`Session`、event、artifact bind、workflow orchestration
- `Diego`：outline + generation 主 authority
- `Studio`：统一内容工坊
- `generation_session_service`：当前会话主链与卡片执行编排

## 核心机制与实现路径

主链必须围绕以下路径写：

`Session bootstrap -> Diego outline -> confirm outline -> Diego generation -> Studio preview/refine -> artifact bind`

当前实现锚点：

- [backend/services/generation_session_service/diego_runtime.py](/Users/ln1/Projects/Spectra/backend/services/generation_session_service/diego_runtime.py)
- [backend/services/generation_session_service/diego_runtime_sync/preview_payload.py](/Users/ln1/Projects/Spectra/backend/services/generation_session_service/diego_runtime_sync/preview_payload.py)
- [backend/services/generation_session_service/card_catalog.py](/Users/ln1/Projects/Spectra/backend/services/generation_session_service/card_catalog.py)
- [backend/services/generation_session_service/card_execution_runtime.py](/Users/ln1/Projects/Spectra/backend/services/generation_session_service/card_execution_runtime.py)

前端产品面锚点：

- [frontend/lib/sdk/studio-cards.ts](/Users/ln1/Projects/Spectra/frontend/lib/sdk/studio-cards.ts)
- [frontend/components/project/features/studio/StudioPanel.tsx](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/StudioPanel.tsx)
- [frontend/components/project/features/studio/tools/](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/tools)

## 当前代码/测试/产品面可以证明的现实

- `Studio` 卡片能力目录已经明确存在
- 非 PPT 产物不是嘴上说说，而是有真实能力面
- 生成链不是黑箱一次性输出，而是带 outline / confirm / refine 的过程

测试锚点：

- [frontend/__tests__/studio-mindmap-preview-edit.test.tsx](/Users/ln1/Projects/Spectra/frontend/__tests__/studio-mindmap-preview-edit.test.tsx)
- [backend/tests/services/test_diego_runtime_sync.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_diego_runtime_sync.py)

## 本节 Mermaid 图

- 图 5-3：Session 生成与 refine 闭环图
- 图 5-4：Studio 多模态外化能力图

## 本节写作禁区与披露边界

- 不把 `Studio` 写成“若干工具按钮”
- 不把 `Diego` 写成普通 LLM 调用
- 不把多模态能力降级成“以后可以支持”
