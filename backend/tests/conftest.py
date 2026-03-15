import pytest
from starlette.testclient import TestClient

from schemas.generation import CoursewareContent


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


@pytest.fixture
def sample_course_data():
    return {
        "title": "Test Course",
        "description": "Test course description",
    }


@pytest.fixture
def integration_output_dir(tmp_path):
    """创建集成测试输出目录"""
    output_dir = tmp_path / "integration_output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


@pytest.fixture
def sample_courseware_content():
    """示例课件内容（复杂）"""
    return CoursewareContent(
        title="Python 编程基础 - 集成测试",
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
is_student = True
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

## 循环语句

使用 for 和 while 循环

```python
for i in range(5):
    print(i)
```

---

# 第三章：函数

## 函数定义

```python
def greet(name):
    return f"Hello, {name}!"

result = greet("Alice")
print(result)
```

---

# 总结

- Python 语法简洁
- 易于学习
- 应用广泛
- 社区活跃
""",
        lesson_plan_markdown="""# 教学目标

## 知识目标
- 掌握 Python 基本语法
- 理解变量和数据类型
- 学会使用控制流语句
- 能够定义和调用函数

## 能力目标
- 能够编写简单的 Python 程序
- 能够调试基础的语法错误
- 能够阅读和理解他人的代码

## 素质目标
- 培养逻辑思维能力
- 培养问题解决能力
- 培养自主学习能力

# 教学重点

1. 变量的定义和使用
2. 数据类型的理解
3. 控制流语句的应用
4. 函数的定义和调用

# 教学难点

1. 变量作用域的理解
2. 循环嵌套的逻辑
3. 函数参数的传递

# 教学过程

## 导入环节（5分钟）

### 活动内容
介绍 Python 的历史和应用场景

### 教学方法
- 展示 Python 在各领域的应用案例
- 播放 Python 创始人的访谈视频

### 预期效果
激发学生学习兴趣

## 讲授环节（20分钟）

### 变量定义（5分钟）

讲解变量的概念和使用方法

**示例代码：**
```python
name = "Alice"
age = 25
```

### 数据类型（8分钟）

介绍常见的数据类型：
- 整数（int）
- 浮点数（float）
- 字符串（str）
- 布尔值（bool）
- 列表（list）
- 字典（dict）

### 控制流（7分钟）

讲解条件语句和循环语句

**条件语句示例：**
```python
if score >= 60:
    print("及格")
else:
    print("不及格")
```

**循环语句示例：**
```python
for i in range(10):
    print(i)
```

## 练习环节（15分钟）

### 练习1：变量操作
编写程序，定义变量并进行基本运算

### 练习2：条件判断
编写程序，判断一个数是奇数还是偶数

### 练习3：循环应用
编写程序，计算 1 到 100 的和

## 总结环节（5分钟）

### 知识回顾
- 变量的定义和使用
- 常见数据类型
- 控制流语句

### 作业布置
1. 完成课后练习题 1-5
2. 编写一个简单的计算器程序
3. 预习下一章内容

### 课后反思
记录本节课的收获和疑问

# 教学评价

## 评价方式
- 课堂表现（20%）
- 练习完成情况（30%）
- 作业质量（30%）
- 期末考试（20%）

## 评价标准
- 优秀：能够熟练运用所学知识
- 良好：能够正确使用基本语法
- 及格：能够理解基本概念
- 不及格：未掌握基本知识

# 教学反思

本节课需要注意：
1. 控制讲授节奏，确保学生理解
2. 多举实例，加深理解
3. 及时解答学生疑问
4. 鼓励学生动手实践
""",
    )


@pytest.fixture
def simple_courseware_content():
    """简单的课件内容（用于快速测试）"""
    return CoursewareContent(
        title="简单测试课件",
        markdown_content="""# 测试标题

这是测试内容

---

# 第二页

更多内容
""",
        lesson_plan_markdown="""# 教学目标

- 目标1
- 目标2

# 教学过程

## 环节1

内容...
""",
    )
