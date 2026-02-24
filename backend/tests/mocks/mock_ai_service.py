"""
Mock AI Service for Testing

提供符合接口契约的 Mock 数据，用于独立测试课件生成功能
"""

from schemas.generation import CoursewareContent


class MockAIService:
    """Mock AI Service for testing"""

    @staticmethod
    def generate_simple_courseware(
        title: str = "测试课件", num_slides: int = 5
    ) -> CoursewareContent:
        """
        生成简单的测试课件

        Args:
            title: 课件标题
            num_slides: 幻灯片数量

        Returns:
            CoursewareContent: 测试用课件内容
        """
        # 生成 PPT Markdown
        slides = ["# " + title, "", "测试副标题"]

        for i in range(1, num_slides):
            slides.append("---")
            slides.append(f"# 第 {i} 章节")
            slides.append("")
            slides.append(f"- 要点 {i}.1")
            slides.append(f"- 要点 {i}.2")
            slides.append(f"- 要点 {i}.3")

        markdown_content = "\n".join(slides)

        # 生成教案 Markdown
        lesson_plan = f"""# 教学目标

- 知识目标：理解{title}的基本概念
- 技能目标：掌握{title}的基本操作
- 情感目标：培养学习兴趣

# 教学重点

- 重点 1：核心概念
- 重点 2：基本操作

# 教学难点

- 难点 1：概念理解
- 难点 2：实践应用

# 教学过程

## 导入环节（5分钟）

教师活动：
- 提出问题，引发思考
- 展示学习目标

学生活动：
- 回答问题
- 明确学习目标

## 讲授环节（20分钟）

### 知识点 1

讲解核心概念...

### 知识点 2

演示基本操作...

## 练习环节（10分钟）

学生完成练习题...

## 总结环节（5分钟）

回顾重点内容...

# 板书设计

```
{title}
├── 概念
├── 操作
└── 应用
```

# 作业布置

1. 完成课后练习 1-3
2. 预习下一课内容
"""

        return CoursewareContent(
            title=title,
            markdown_content=markdown_content,
            lesson_plan_markdown=lesson_plan,
        )

    @staticmethod
    def generate_python_list_dict_courseware() -> CoursewareContent:
        """生成 Python 列表和字典课件（完整示例）"""
        return CoursewareContent(
            title="Python 列表和字典 - 基础操作",
            markdown_content="""# Python 列表和字典

基础操作入门

---

# 学习目标

- 理解列表和字典的概念
- 掌握基本操作方法
- 能够在实际项目中应用

---

# 什么是列表？

列表是 Python 中最常用的数据结构之一

- 有序的元素集合
- 可以包含不同类型的数据
- 使用方括号 `[]` 表示

```python
fruits = ['apple', 'banana', 'orange']
```

---

# 列表的基本操作

## 访问元素

```python
fruits[0]  # 'apple'
fruits[-1]  # 'orange'
```

## 添加元素

```python
fruits.append('grape')
fruits.insert(1, 'mango')
```

---

# 什么是字典？

字典是键值对的集合

- 无序（Python 3.7+ 保持插入顺序）
- 键必须唯一
- 使用花括号 `{}` 表示

```python
student = {
    'name': 'Alice',
    'age': 20,
    'grade': 'A'
}
```

---

# 字典的基本操作

## 访问值

```python
student['name']  # 'Alice'
student.get('age')  # 20
```

## 添加/修改

```python
student['major'] = 'CS'
student['age'] = 21
```

---

# 实践练习

创建一个学生信息管理系统：

1. 使用列表存储多个学生
2. 每个学生用字典表示
3. 实现添加、查询、修改功能

---

# 总结

- 列表：有序集合，适合存储序列数据
- 字典：键值对，适合存储结构化数据
- 两者都是 Python 中非常重要的数据结构

---

# 作业

1. 完成课后练习题 1-5
2. 编写一个简单的通讯录程序
3. 预习下一课：列表推导式
""",
            lesson_plan_markdown="""# 教学目标

## 知识目标
- 学生能够理解列表和字典的概念和特点
- 学生能够说出列表和字典的区别
- 学生能够掌握列表和字典的基本操作方法

## 技能目标
- 学生能够创建和使用列表
- 学生能够创建和使用字典
- 学生能够在实际编程中选择合适的数据结构

## 情感目标
- 培养学生的逻辑思维能力
- 激发学生对编程的兴趣
- 培养学生解决实际问题的能力

# 教学重点

- 列表的创建和基本操作（访问、添加、删除）
- 字典的创建和基本操作（访问、添加、修改）
- 列表和字典的应用场景

# 教学难点

- 列表索引的理解（特别是负索引）
- 字典键的唯一性和不可变性要求
- 如何选择使用列表还是字典

# 教学过程

## 导入环节（5分钟）

### 教师活动
- 提问：在日常生活中，我们如何管理多个物品？
- 引导学生思考：编程中如何存储多个数据？
- 展示本节课的学习目标

### 学生活动
- 回答问题，分享自己的想法
- 思考编程中的数据存储需求

## 讲授环节 - 列表（15分钟）

### 知识点 1：列表的概念

教师讲解列表的定义和特点，演示列表的创建方法。

代码示例：
```python
fruits = ['apple', 'banana', 'orange']
numbers = [1, 2, 3, 4, 5]
mixed = [1, 'hello', 3.14, True]
```

### 知识点 2：列表的基本操作

演示索引访问、添加元素、删除元素、切片操作。

## 讲授环节 - 字典（15分钟）

### 知识点 3：字典的概念

讲解字典的定义和特点，对比字典和列表的区别。

### 知识点 4：字典的基本操作

演示通过键访问值、添加和修改键值对、删除键值对。

## 练习环节（10分钟）

### 练习 1：列表操作
创建一个包含 5 个数字的列表，完成访问、添加、删除操作。

### 练习 2：字典操作
创建一个表示图书的字典，完成访问、修改、添加操作。

## 综合应用（10分钟）

创建一个简单的学生信息管理系统，使用列表存储多个学生字典。

## 总结环节（5分钟）

回顾本节课重点内容，布置作业，预告下节课内容。

# 板书设计

```
Python 数据结构

列表 (List)                    字典 (Dictionary)
├── 有序集合                   ├── 键值对集合
├── 使用 []                    ├── 使用 {}
├── 通过索引访问               ├── 通过键访问
└── 操作方法                   └── 操作方法
```

# 作业布置

1. 创建一个包含 10 个整数的列表，计算总和和平均值
2. 创建一个字典存储个人信息
3. 编写一个简单的通讯录程序

# 教学反思

（课后填写）
""",
        )

    @staticmethod
    def generate_complex_courseware(num_slides: int = 50) -> CoursewareContent:
        """
        生成复杂课件（用于性能测试）

        Args:
            num_slides: 幻灯片数量

        Returns:
            CoursewareContent: 复杂测试课件
        """
        # 生成大量幻灯片
        slides = ["# 复杂测试课件", "", f"包含 {num_slides} 页幻灯片"]

        for i in range(1, num_slides):
            slides.append("---")
            slides.append(f"# 页面 {i}")
            slides.append("")
            slides.append(f"## 子标题 {i}")
            slides.append("")
            slides.append(f"- 内容 {i}.1")
            slides.append(f"- 内容 {i}.2")
            slides.append(f"- 内容 {i}.3")
            slides.append("")
            slides.append("```python")
            slides.append(f"# 代码示例 {i}")
            slides.append(f"result = calculate({i})")
            slides.append("```")

        markdown_content = "\n".join(slides)

        # 生成详细教案
        lesson_sections = ["# 教学目标\n"]
        lesson_sections.extend([f"- 目标 {i}" for i in range(1, 21)])
        lesson_sections.append("\n# 教学过程\n")

        for i in range(1, 11):
            lesson_sections.append(f"## 环节 {i}\n")
            lesson_sections.append(f"教学内容 {i}...\n")

        lesson_plan = "\n".join(lesson_sections)

        return CoursewareContent(
            title=f"复杂测试课件 - {num_slides}页",
            markdown_content=markdown_content,
            lesson_plan_markdown=lesson_plan,
        )

    @staticmethod
    def generate_with_code_blocks() -> CoursewareContent:
        """生成包含代码块的课件"""
        return CoursewareContent(
            title="Python 函数编程",
            markdown_content="""# Python 函数编程

掌握函数的定义和使用

---

# 什么是函数？

函数是可重用的代码块

```python
def greet(name):
    return f"Hello, {name}!"

result = greet("Alice")
print(result)  # Hello, Alice!
```

---

# 函数参数

## 位置参数

```python
def add(a, b):
    return a + b

result = add(3, 5)  # 8
```

## 关键字参数

```python
def describe_person(name, age, city):
    return f"{name}, {age}, from {city}"

result = describe_person(name="Bob", age=25, city="NYC")
```

---

# 默认参数

```python
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

print(greet("Alice"))              # Hello, Alice!
print(greet("Bob", "Hi"))          # Hi, Bob!
```

---

# 返回值

函数可以返回多个值

```python
def calculate(a, b):
    sum_result = a + b
    diff_result = a - b
    return sum_result, diff_result

s, d = calculate(10, 3)
print(s, d)  # 13 7
```

---

# 总结

- 函数提高代码复用性
- 参数让函数更灵活
- 返回值传递计算结果
""",
            lesson_plan_markdown="""# 教学目标

- 理解函数的概念和作用
- 掌握函数的定义和调用
- 理解参数和返回值

# 教学重点

- 函数的定义语法
- 参数的使用（位置参数、关键字参数、默认参数）
- 返回值的处理

# 教学难点

- 参数传递机制
- 多返回值的解包
- 函数作用域

# 教学过程

## 导入环节（5分钟）

引导学生思考：为什么需要函数？

## 讲授环节（25分钟）

### 知识点 1：函数定义

讲解 def 关键字、函数名、参数列表、函数体。

### 知识点 2：参数类型

演示位置参数、关键字参数、默认参数的使用。

### 知识点 3：返回值

讲解 return 语句和多返回值。

## 练习环节（10分钟）

学生编写简单函数，完成指定功能。

## 总结环节（5分钟）

回顾函数的核心概念。

# 作业布置

1. 编写一个计算器函数
2. 编写一个判断素数的函数
3. 编写一个字符串处理函数
""",
        )

    @staticmethod
    def generate_with_images() -> CoursewareContent:
        """生成包含图片的课件（使用占位符）"""
        return CoursewareContent(
            title="数据可视化入门",
            markdown_content="""# 数据可视化入门

使用图表展示数据

---

# 为什么需要可视化？

- 直观展示数据
- 发现数据规律
- 辅助决策

![数据可视化示例](https://via.placeholder.com/600x400?text=Data+Visualization)

---

# 常见图表类型

## 折线图

适合展示趋势变化

![折线图](https://via.placeholder.com/600x400?text=Line+Chart)

---

# 柱状图

适合比较不同类别

![柱状图](https://via.placeholder.com/600x400?text=Bar+Chart)

---

# 饼图

适合展示占比

![饼图](https://via.placeholder.com/600x400?text=Pie+Chart)

---

# 总结

选择合适的图表类型很重要
""",
            lesson_plan_markdown="""# 教学目标

- 理解数据可视化的重要性
- 认识常见的图表类型
- 学会选择合适的图表

# 教学过程

## 导入环节

展示数据可视化的实际案例。

## 讲授环节

介绍折线图、柱状图、饼图等常见图表。

## 练习环节

学生分析数据，选择合适的图表类型。

# 作业布置

收集数据并创建可视化图表。
""",
        )

    @staticmethod
    async def generate_courseware_content(
        project_id: str, user_requirements: str, template_style: str = "default"
    ) -> CoursewareContent:
        """
        模拟 AI Service 生成课件内容

        Args:
            project_id: 项目 ID
            user_requirements: 用户需求描述
            template_style: 模板风格

        Returns:
            CoursewareContent: 生成的课件内容
        """
        # 根据关键词返回不同的 Mock 数据
        if "python" in user_requirements.lower() and "列表" in user_requirements:
            return MockAIService.generate_python_list_dict_courseware()
        elif "函数" in user_requirements:
            return MockAIService.generate_with_code_blocks()
        elif "可视化" in user_requirements:
            return MockAIService.generate_with_images()
        elif "复杂" in user_requirements or "性能" in user_requirements:
            return MockAIService.generate_complex_courseware(50)
        else:
            # 默认返回简单课件
            return MockAIService.generate_simple_courseware(
                title=user_requirements[:50], num_slides=5  # 使用需求作为标题
            )


# 预定义的测试数据
SIMPLE_COURSEWARE = MockAIService.generate_simple_courseware()
PYTHON_LIST_DICT_COURSEWARE = MockAIService.generate_python_list_dict_courseware()
COMPLEX_COURSEWARE = MockAIService.generate_complex_courseware(50)
CODE_BLOCKS_COURSEWARE = MockAIService.generate_with_code_blocks()
IMAGES_COURSEWARE = MockAIService.generate_with_images()

# 导出
__all__ = [
    "MockAIService",
    "SIMPLE_COURSEWARE",
    "PYTHON_LIST_DICT_COURSEWARE",
    "COMPLEX_COURSEWARE",
    "CODE_BLOCKS_COURSEWARE",
    "IMAGES_COURSEWARE",
]
