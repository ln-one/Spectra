# AI Service 接口契约文档

## 概述

本文档定义了课件生成服务（GenerationService）与 AI 服务（AIService）之间的接口契约。

**责任划分**：
- **AI Service（成员 D）**：负责生成符合格式的 Markdown 内容
- **Generation Service（成员 A）**：负责将 Markdown 转换为 PPTX 和 DOCX 文件

## 数据模型

### CoursewareContent

```python
from pydantic import BaseModel, Field

class CoursewareContent(BaseModel):
    """课件内容 - AI Service 与 Generation Service 的接口契约"""
    
    title: str = Field(..., description="课件标题")
    markdown_content: str = Field(..., description="PPT 的 Markdown 内容（包含 Marp frontmatter）")
    lesson_plan_markdown: str = Field(..., description="教案的 Markdown 内容")
```

### 字段说明

#### 1. title (必填)
- **类型**: `str`
- **约束**: 
  - 长度不超过 200 字符
  - 不能为空或仅包含空白字符
- **用途**: 作为课件的主标题，会被用于：
  - PPTX 的首页标题
  - 文件名的一部分
  - 教案的标题

**示例**：
```python
title = "Python 基础编程 - 第一课"
```

#### 2. markdown_content (必填)
- **类型**: `str`
- **约束**:
  - 大小不超过 1MB
  - 不能包含潜在危险内容（`<script>`, `<?php>`, `<%`）
- **格式**: Marp 格式的 Markdown
- **用途**: 生成 PPTX 文件

**Marp Markdown 格式规范**：

```markdown
---
marp: true
theme: default
paginate: true
---

# 课件标题

副标题或简介

---

# 第一章节标题

- 要点 1
- 要点 2
- 要点 3

---

# 第二章节标题

## 子标题

内容段落...

---

# 总结

- 总结要点 1
- 总结要点 2
```

**关键要素**：
1. **Frontmatter**（可选，Generation Service 会自动添加）：
   ```yaml
   ---
   marp: true
   theme: default
   paginate: true
   ---
   ```

2. **幻灯片分隔符**：使用 `---` 分隔每一页
3. **标题层级**：
   - `#` 一级标题：用于幻灯片主标题
   - `##` 二级标题：用于子标题
   - `###` 三级标题：用于更细的分类

4. **内容元素**：
   - 列表：使用 `-` 或 `1.`
   - 代码块：使用 ` ``` `
   - 图片：`![alt](url)`
   - 表格：标准 Markdown 表格语法

#### 3. lesson_plan_markdown (必填)
- **类型**: `str`
- **约束**:
  - 大小不超过 1MB
  - 不能包含潜在危险内容
- **格式**: 标准 Markdown
- **用途**: 生成 DOCX 教案文件

**教案 Markdown 格式规范**：

```markdown
# 教学目标

- 知识目标：学生能够理解...
- 技能目标：学生能够掌握...
- 情感目标：培养学生...

# 教学重点

- 重点 1
- 重点 2

# 教学难点

- 难点 1
- 难点 2

# 教学过程

## 导入环节（5分钟）

教师活动：
- 活动 1
- 活动 2

学生活动：
- 活动 1
- 活动 2

## 讲授环节（20分钟）

### 知识点 1

内容...

### 知识点 2

内容...

## 练习环节（10分钟）

练习内容...

## 总结环节（5分钟）

总结内容...

# 板书设计

```
主题
├── 要点 1
├── 要点 2
└── 要点 3
```

# 作业布置

1. 作业 1
2. 作业 2

# 教学反思

（课后填写）
```

**推荐结构**：
1. 教学目标（必须）
2. 教学重点和难点（必须）
3. 教学过程（必须，包含时间分配）
4. 板书设计（推荐）
5. 作业布置（推荐）
6. 教学反思（可选）

## AI Service 实现指南

### 方法签名

```python
async def generate_courseware_content(
    project_id: str,
    user_requirements: str,
    template_style: str = "default"
) -> CoursewareContent:
    """
    生成课件内容
    
    Args:
        project_id: 项目 ID
        user_requirements: 用户需求描述
        template_style: 模板风格（default/gaia/uncover/academic）
    
    Returns:
        CoursewareContent: 符合接口契约的课件内容
    """
    pass
```

### 实现步骤

1. **理解用户需求**
   - 解析用户输入的教学主题
   - 识别目标学生群体
   - 确定教学目标和重点

2. **生成 PPT Markdown**
   - 创建首页（标题 + 副标题）
   - 生成章节页（每个知识点一页）
   - 添加总结页
   - 使用 `---` 分隔每一页
   - 确保内容简洁（每页 3-5 个要点）

3. **生成教案 Markdown**
   - 按照教案结构模板生成
   - 包含教学目标、重点难点
   - 详细描述教学过程（包含时间分配）
   - 添加教师活动和学生活动

4. **验证输出**
   - 检查 Markdown 格式是否正确
   - 确保没有危险内容
   - 验证长度限制

### 示例实现（伪代码）

```python
async def generate_courseware_content(
    project_id: str,
    user_requirements: str,
    template_style: str = "default"
) -> CoursewareContent:
    # 1. 调用 LLM 生成内容
    prompt = f"""
    请为以下教学主题生成课件内容：
    
    主题：{user_requirements}
    
    要求：
    1. 生成 Marp 格式的 PPT Markdown（10-15 页）
    2. 生成详细的教案 Markdown
    3. 内容要适合教学场景
    """
    
    response = await ai_service.generate(prompt, max_tokens=4000)
    
    # 2. 解析 LLM 输出
    # 假设 LLM 返回的格式是：
    # PPT_CONTENT:
    # ...
    # LESSON_PLAN:
    # ...
    
    parts = response['content'].split('LESSON_PLAN:')
    ppt_content = parts[0].replace('PPT_CONTENT:', '').strip()
    lesson_plan = parts[1].strip() if len(parts) > 1 else ""
    
    # 3. 提取标题
    title_match = re.search(r'^#\s+(.+)$', ppt_content, re.MULTILINE)
    title = title_match.group(1) if title_match else user_requirements
    
    # 4. 构建返回对象
    return CoursewareContent(
        title=title,
        markdown_content=ppt_content,
        lesson_plan_markdown=lesson_plan
    )
```

## 测试数据

为了方便测试，提供以下 Mock 数据（详见 `backend/tests/mocks/mock_ai_service.py`）：

### 简单课件（用于快速测试）

```python
from tests.mocks import SIMPLE_COURSEWARE
```

### 复杂课件（用于性能测试）

```python
from tests.mocks import COMPLEX_COURSEWARE
```

### 完整示例课件

```python
from tests.mocks import PYTHON_LIST_DICT_COURSEWARE
```

## 错误处理

AI Service 应该处理以下错误情况：

1. **LLM 调用失败**
   - 返回默认的示例内容
   - 记录错误日志
   - 不要让整个请求失败

2. **生成内容格式错误**
   - 验证 Markdown 格式
   - 如果格式错误，尝试修复
   - 如果无法修复，返回简化版本

3. **内容超长**
   - 截断过长的内容
   - 确保不超过 1MB 限制

4. **内容为空**
   - 返回默认的占位内容
   - 记录警告日志

## 版本历史

- **v1.0** (2024-02-24): 初始版本
  - 定义基本接口契约
  - 提供 Markdown 格式规范
  - 添加完整示例

## 联系方式

如有疑问，请联系：
- **Generation Service 负责人**：成员 A
- **AI Service 负责人**：成员 D

## 参考资料

- [Marp 官方文档](https://marpit.marp.app/)
- [Markdown 语法指南](https://www.markdownguide.org/)
- [Pydantic 文档](https://docs.pydantic.dev/)
- [Mock AI Service 实现](../../backend/tests/mocks/mock_ai_service.py)
