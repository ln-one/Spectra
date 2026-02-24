# 课件生成服务模块

## 模块结构

按照项目规范（单文件 <300 行），原有的大文件已拆分为模块化结构：

### Generation Service（课件生成服务）

```
backend/services/generation/
├── __init__.py           (144 行) - 主服务类，编排生成流程
├── types.py              (18 行)  - 数据类型定义
├── tool_checker.py       (97 行)  - 工具检测（Marp/Pandoc）
├── marp_generator.py     (178 行) - PPTX 生成器
└── pandoc_generator.py   (188 行) - DOCX 生成器
```

**职责**：
- 调用 Marp CLI 生成 PPTX
- 调用 Pandoc 生成 DOCX
- 工具检测和错误处理
- 文件管理和清理

### Template Service（模板服务）

```
backend/services/template/
├── __init__.py           (99 行)  - 主服务类，模板管理
├── types.py              (25 行)  - 模板类型定义
├── marp_template.py      (87 行)  - Marp 模板生成
├── pandoc_template.py    (46 行)  - Pandoc 模板管理
└── css_generator.py      (173 行) - CSS 样式生成
```

**职责**：
- 管理多种模板风格（DEFAULT, GAIA, UNCOVER, ACADEMIC）
- 生成 Marp frontmatter
- 生成自定义 CSS
- 管理 Pandoc 模板

## 使用方式

### 导入

```python
# 生成服务
from services.generation import GenerationService, CoursewareContent

# 模板服务
from services.template import TemplateService, TemplateConfig, TemplateStyle
```

### 基本使用

```python
# 创建课件内容
content = CoursewareContent(
    title="Python 编程基础",
    markdown_content="# 第一章\n\n内容...",
    lesson_plan_markdown="# 教学目标\n\n- 目标1"
)

# 创建服务
service = GenerationService()

# 生成 PPTX
config = TemplateConfig(
    style=TemplateStyle.GAIA,
    primary_color="#FF6B6B"
)
pptx_path = await service.generate_pptx(content, "task-001", config)

# 生成 DOCX
docx_path = await service.generate_docx(content, "task-001")
```

## 测试

运行测试脚本：

```bash
python backend/test_phase2a_generation.py
```

## 规范遵循

✅ 所有文件 <300 行  
✅ 使用 snake_case 命名  
✅ 包含类型提示  
✅ 完整的文档字符串  
✅ 结构化错误处理  
✅ 异步 IO 操作  

## 依赖工具

- **Marp CLI** - `npm install -g @marp-team/marp-cli`
- **Pandoc** - `brew install pandoc` (macOS) 或 `apt-get install pandoc` (Linux)
