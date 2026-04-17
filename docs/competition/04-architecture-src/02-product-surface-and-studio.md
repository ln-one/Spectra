# 02. 前端工作台与 Studio 产品面

## 本节要解释的系统问题

为什么 `Spectra` 的产品面不是单点生成器，而是统一工作台和多模态内容工坊。

## 产品本体位置

- 教师进入的是课程知识工作台
- `Studio` 承接多模态外化能力
- 各产物共享同一课程空间与上下文

## 当前真实实现如何支撑

- `StudioPanel` 已经是统一产品入口
- `STUDIO_CARD_BY_TOOL` 当前映射了 `courseware_ppt`、`word_document`、`knowledge_mindmap`、`interactive_quick_quiz`、`interactive_games`、`demonstration_animations`、`speaker_notes`、`classroom_qa_simulator`
- capability state 已经体现 source binding、protocol pending、真实后端输出等待态

## 可证明事实

- mindmap / animation / game / simulation / word 等 tool surface 已在前端存在
- 非 PPT 产物的 pending / backend output 语义已经进入产品面

## 本节图

- 图 4-2 Studio 产品面与多模态外化图

## 边界

- 不在第 4 章展开各 tool 的实现细节
- 不把 `Studio` 写成“若干工具按钮”
