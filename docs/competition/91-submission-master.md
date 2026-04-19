# Spectra 商业方案书主稿入口

> Status: `current`
> Role: canonical assembly entry for the external commercial proposal.

## 打包入口

正式主稿 `DOCX` 的 canonical 打包链固定为：

```bash
python3 /Users/ln1/Projects/Spectra/scripts/build_competition_docx.py
```

该命令会完成两件事：

1. 重新生成 [92-final-submission-draft.md](./92-final-submission-draft.md) 作为单一合并 Markdown 主稿；
2. 以 [docs_origin/Spectra.docx](/Users/ln1/Projects/Spectra/docs_origin/Spectra.docx) 的可借视觉元素为参考底，通过 `pandoc + python-docx` 两段式后处理，重新导出正式主稿 `DOCX`。

当前 `DOCX` 生产规则固定为：

- 执行摘要前置，但不占正文 `1`
- 正文从 [01-overview.md](./01-overview.md) 开始编号
- 一级/二级/三级标题统一为 `1 / 1.1 / 1.1.1`
- Mermaid 不转正式图片，只保留规范图位占位块
- 表格统一为有线表格，表题统一为 `表 x-x`
- 正文样式走“中文正式方案书”而不是 Markdown 默认长文档风

## 正文顺序

1. [执行摘要](./00-executive-summary.md)
2. [前言与项目综述](./01-overview.md)
3. [可行性分析](./02-feasibility.md)
4. [业务与需求分析](./03-requirements-analysis.md)
5. [系统架构设计](./04-architecture.md)
6. [关键技术实现](./05-key-technologies.md)
7. [项目测试与成果展示](./06-testing-evaluation.md)
8. [组织管理](./07-organization-management.md)
9. [商业企划](./08-business-plan.md)
10. [风险管理](./09-risk-management.md)
11. [结语](./10-conclusion.md)

## 附录顺序

1. [术语表](./00-terms.md)
2. [主稿结构建议](./90-submission-manuscript.md)

## 不进入正式正文的内部文件

- `00-writing-guide.md`
- `00-truth-check-checklist.md`
- `00-figure-plan.md`
- `00-evidence-policy.md`
- `90-submission-manuscript.md`
- `92-final-submission-draft.md`
- `93-requirements-coverage.md`
- `99-self-review.md`

## 使用规则

1. 正式对外主稿以 `00` 到 `10` 为准。
2. 所有内容必须能离开仓库独立成立。
3. `92-final-submission-draft.md` 是 `pandoc` 唯一输入的单一合并主稿，不再长期作为占位说明存在。
4. 最终导出为 DOCX/PDF 时，由打包脚本统一处理封面、目录、图题、编号、页码、缩进、表格线框与图位样式，不长期在 Word 中手工漂移维护。
