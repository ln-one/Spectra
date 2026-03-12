"""
Phase 2A 课件生成功能测试

测试 Marp CLI 和 Pandoc 集成是否正常工作
"""

import asyncio
import sys
from pathlib import Path

# 添加 backend 到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from services.generation import CoursewareContent, GenerationService
from services.template import TemplateConfig, TemplateStyle


async def test_pptx_generation():
    """测试 PPTX 生成"""
    print("=" * 60)
    print("测试 PPTX 生成")
    print("=" * 60)

    # 创建测试内容
    content = CoursewareContent(
        title="Python 编程基础",
        markdown_content="""# Python 编程基础

## 课程简介

本课程将介绍 Python 编程的基础知识

---

# 第一章：变量与数据类型

## 变量定义

- 变量是存储数据的容器
- Python 是动态类型语言
- 不需要声明变量类型

```python
name = "Alice"
age = 25
```

---

# 第二章：控制流

## 条件语句

使用 if-elif-else 进行条件判断

```python
if age >= 18:
    print("成年人")
else:
    print("未成年人")
```

---

# 总结

- Python 语法简洁
- 易于学习
- 应用广泛
""",
        lesson_plan_markdown="""# 教学目标

- 掌握 Python 基本语法
- 理解变量和数据类型
- 学会使用控制流语句

# 教学过程

## 导入环节（5分钟）

介绍 Python 的历史和应用场景

## 讲授环节（20分钟）

### 变量定义

讲解变量的概念和使用方法

### 数据类型

介绍常见的数据类型：
- 整数（int）
- 浮点数（float）
- 字符串（str）
- 布尔值（bool）

## 练习环节（15分钟）

学生动手编写简单的 Python 程序

## 总结环节（5分钟）

回顾本节课的重点内容
""",
    )

    # 创建服务实例
    service = GenerationService(output_dir="backend/generated")

    # 测试默认模板
    print("\n1. 测试默认模板...")
    try:
        pptx_path = await service.generate_pptx(content, "test-default")
        print(f"✓ 生成成功: {pptx_path}")
    except Exception as e:
        print(f"✗ 生成失败: {e}")
        return False

    # 测试 GAIA 模板
    print("\n2. 测试 GAIA 模板...")
    try:
        config = TemplateConfig(style=TemplateStyle.GAIA, primary_color="#FF6B6B")
        pptx_path = await service.generate_pptx(content, "test-gaia", config)
        print(f"✓ 生成成功: {pptx_path}")
    except Exception as e:
        print(f"✗ 生成失败: {e}")
        return False

    # 测试 UNCOVER 模板
    print("\n3. 测试 UNCOVER 模板...")
    try:
        config = TemplateConfig(style=TemplateStyle.UNCOVER, primary_color="#4ECDC4")
        pptx_path = await service.generate_pptx(content, "test-uncover", config)
        print(f"✓ 生成成功: {pptx_path}")
    except Exception as e:
        print(f"✗ 生成失败: {e}")
        return False

    return True


async def test_docx_generation():
    """测试 DOCX 生成"""
    print("\n" + "=" * 60)
    print("测试 DOCX 生成")
    print("=" * 60)

    content = CoursewareContent(
        title="Python 编程基础",
        markdown_content="# Test",
        lesson_plan_markdown="""# 教学目标

- 掌握 Python 基本语法
- 理解变量和数据类型
- 学会使用控制流语句

# 教学过程

## 导入环节（5分钟）

介绍 Python 的历史和应用场景

## 讲授环节（20分钟）

### 变量定义

讲解变量的概念和使用方法

### 数据类型

介绍常见的数据类型：
- 整数（int）
- 浮点数（float）
- 字符串（str）
- 布尔值（bool）

## 练习环节（15分钟）

学生动手编写简单的 Python 程序

## 总结环节（5分钟）

回顾本节课的重点内容
""",
    )

    service = GenerationService(output_dir="backend/generated")

    print("\n测试教案生成...")
    try:
        docx_path = await service.generate_docx(content, "test-lesson-plan")
        print(f"✓ 生成成功: {docx_path}")
    except Exception as e:
        print(f"✗ 生成失败: {e}")
        return False

    return True


async def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("Phase 2A 课件生成功能测试")
    print("=" * 60)

    # 测试 PPTX 生成
    pptx_ok = await test_pptx_generation()

    # 测试 DOCX 生成
    docx_ok = await test_docx_generation()

    # 输出测试结果
    print("\n" + "=" * 60)
    print("测试结果")
    print("=" * 60)
    print(f"PPTX 生成: {'✓ 通过' if pptx_ok else '✗ 失败'}")
    print(f"DOCX 生成: {'✓ 通过' if docx_ok else '✗ 失败'}")

    if pptx_ok and docx_ok:
        print("\n✓ 所有测试通过！")
        print("\n生成的文件位于: backend/generated/")
        return 0
    else:
        print("\n✗ 部分测试失败")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
