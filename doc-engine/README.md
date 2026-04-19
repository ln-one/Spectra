# Personal Doc Engine

一个面向中文长文档的个人 AI 文档引擎种子。它的定位不是“某次比赛的脚本”，而是可独立抽离、可持续复用的文档生产底座：

- 模板负责结构与交付
- AI 负责内容与说明
- `pandoc + reference.docx + python-docx` 负责稳定落成 `DOCX`
- `PDF` 作为跟出产物
- Codex skill 作为后续调用入口

## 为什么这样做

这套设计不是凭空拍脑袋抽象出来的，底层直接站在成熟轮子上：

- [Quarto Word templates](https://quarto.org/docs/output-formats/ms-word-templates.html)
- [Quarto docx options](https://quarto.org/docs/reference/formats/docx.html)
- [Pandoc User’s Guide: reference.docx](https://www.pandoc.org/demo/example2.html)
- [python-docx styles](https://python-docx.readthedocs.io/en/stable/user/styles-using.html)
- [python-docx built-in styles internals](https://python-docx.readthedocs.io/en/latest/user/styles-understanding.html)
- [Quarto custom format extensions](https://quarto.org/docs/extensions/formats.html)

这些轮子给出的共同结论很稳定：

1. `DOCX` 最稳的主路径仍然是 `markdown -> pandoc -> reference.docx`
2. 真正想把目录、表格、图题、题注、页脚和中文长文档风格收稳，最后一公里还是要靠 `python-docx`
3. 模板要做成分层，而不是每个学校/比赛复制一整包

## 目录结构

```text
doc-engine/
├── pyproject.toml
├── README.md
├── src/doc_engine/
│   ├── __init__.py
│   ├── ai.py
│   ├── assemble.py
│   ├── build.py
│   ├── cli.py
│   ├── models.py
│   ├── profiles.py
│   └── word_pipeline.py
├── templates/
│   ├── base/
│   ├── covers/
│   ├── frontmatter/
│   ├── body/
│   └── tables-figures/
├── profiles/
├── examples/
└── skill/
```

## 三层能力

### 1. 模板层

- 封面层
- 目录层
- 正文层
- 图表层
- 声明页 / 摘要页
- 学校 / 比赛 / 课程自定义层

### 2. 内容层

- AI 起草
- AI 改写
- AI 压缩
- AI 摘要
- 图题 / 图注 / 说明文生成

第一版不让 AI 决定 Word 样式、目录行为、标题编号、页边距和表格线框。

### 3. 交付层

- Markdown 合并
- `pandoc -> docx`
- `python-docx` 后处理
- `pdf` 跟出

## 当前已经做成的第一版

第一版已经具备这些能力：

- profile 驱动
- 单一主稿合并
- `DOCX` 导出
- 中文长文档样式后处理
- 表格线框与表头
- 图位占位块
- `PDF` 最佳努力导出
- `ai_tasks.yaml` 任务简报产物

第一版还没有内置真实 LLM provider。AI 层目前先做成**结构化任务合同**，方便后续由 Codex skill 或外部 agent 接管。

## 核心命令

```bash
cd doc-engine
python3 -m pip install -e .

build-doc ./profiles/competition-a.yaml ./examples/competition-a/source \
  --exec-summary ./examples/competition-a/source/00-executive-summary.md \
  --ai-tasks ./examples/competition-a/ai_tasks.yaml \
  --build-dir ./build/competition-a \
  --output-name competition-a
```

## 第一版 profile

- `competition-a`
- `school-lab-report`
- `course-project`
- `thesis-lite`

## Skill 化入口

后续把这个引擎包成 Codex skill 时，skill 不再重复实现文档逻辑，只做四件事：

1. 识别文档类型
2. 选择 profile
3. 生成或改写内容
4. 调用这个引擎输出 `docx/pdf`

也就是说：

- 引擎是资产本体
- skill 是调用壳

## 当前边界

第一版优先服务通用中文长文档，不耦合 Spectra 项目事实。

它已经可以被 Spectra 当前主稿重用，但不会反过来把 Spectra 的业务语义写死进引擎里。
