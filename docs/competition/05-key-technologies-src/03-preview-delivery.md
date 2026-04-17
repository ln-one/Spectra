# 03. 预览、渲染与标准交付

## 要解决的业务问题

商业系统不能接受“前端看起来有内容，但正式交付不是同一套结果”的情况。预览链、渲染链和导出链必须统一。

## 对应的产品能力与外化结果

- `PPT` preview / download / history
- `Word 教案` preview / download
- 导图、动画、互动内容等非 PPT 产物的真实 preview contract
- artifact history / source binding / download contract

## 采用的微服务与关键技术

- `Pagevra`：preview / render / export authority
- `Spectra Backend`：artifact download binding、response shaping
- 前端 preview contract：后端真实产物返回前不伪造内容

## 核心机制与实现路径

当前实现锚点：

- [backend/services/render_engine_adapter.py](/Users/ln1/Projects/Spectra/backend/services/render_engine_adapter.py)
- [backend/services/task_executor/runtime_render_outputs.py](/Users/ln1/Projects/Spectra/backend/services/task_executor/runtime_render_outputs.py)
- [backend/services/preview_helpers/rendered_preview.py](/Users/ln1/Projects/Spectra/backend/services/preview_helpers/rendered_preview.py)

前端锚点：

- [frontend/components/project/features/studio/tools/word/PreviewStep.tsx](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/tools/word/PreviewStep.tsx)
- [frontend/components/project/features/studio/tools/mindmap/PreviewStep.tsx](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/tools/mindmap/PreviewStep.tsx)
- [frontend/components/project/features/studio/tools/animation/PreviewStep.tsx](/Users/ln1/Projects/Spectra/frontend/components/project/features/studio/tools/animation/PreviewStep.tsx)

## 当前代码/测试/产品面可以证明的现实

- 非 PPT 产物在前端明确遵守“后端真实产物优先”的原则
- 系统已经形成 preview / history / download 这类正式交付语义
- `Pagevra` 在当前文档里应被写成统一 preview / render / export authority

测试锚点：

- [frontend/__tests__/studio-non-ppt-preview-capability.test.tsx](/Users/ln1/Projects/Spectra/frontend/__tests__/studio-non-ppt-preview-capability.test.tsx)
- [backend/tests/services/test_render_engine_adapter.py](/Users/ln1/Projects/Spectra/backend/tests/services/test_render_engine_adapter.py)

## 本节 Mermaid 图

- 图 5-5：真实预览与标准交付图

## 本节写作禁区与披露边界

- 不把 preview 写成前端 demo 层
- 不把 render/export 重新写回 Spectra 本地主链
- 不暗示系统用假内容撑产品面
