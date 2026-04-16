# Artifact Generator Helpers

`artifact_generator/` 现在只代表 **本地非 Office 文件 helper**。

当前职责：

- 存储路径计算
- JSON/HTML/summary/mindmap/animation/video 等本地文件辅助
- 动画、媒体相关的本地编排 helper

不再承担的职责：

- backend-local PPTX/DOCX render authority
- 本地 Marp/Pandoc Office 主链

当前边界：

- PPTX/DOCX：`Pagevra`
- formal artifact state：`Ourograph`
- AI PPT generation：`Diego`

如果后续继续清理，这个目录应优先朝“media/animation helper collection”方向讲述，而不是“通用 artifact engine”。
