# MVP AI 配置说明

> AI 服务配置和 Fallback 机制 | 更新时间：2026-02-27

## 🎯 重要说明

**MVP 可以在没有真实 AI API Key 的情况下运行！**

系统内置了完整的 fallback 机制，当 AI 服务调用失败时，会自动使用预设的模板内容生成课件。

---

## 🔧 两种运行模式

### 模式 1: Fallback 模式（推荐用于 MVP 演示）

**优点**：
- ✅ 无需申请 API Key
- ✅ 无需付费
- ✅ 响应速度快（无网络延迟）
- ✅ 结果稳定可预测

**缺点**：
- ❌ 生成内容是预设模板，不够智能
- ❌ 无法根据用户需求定制内容

**配置**：
```bash
# backend/.env
# 保持默认的占位符即可，系统会自动使用 fallback
DASHSCOPE_API_KEY="sk-your-dashscope-api-key"
```

**生成的内容示例**：
```markdown
# Python 基础教程

---

# 导入
- 引入主题
- 激发兴趣

---

# 核心内容
- 重点概念
- 案例分析

---

# 练习与讨论
- 课堂练习
- 小组讨论

---

# 总结
- 回顾要点
- 作业布置
```

---

### 模式 2: 真实 AI 模式（可选）

**优点**：
- ✅ 智能生成，根据用户需求定制
- ✅ 内容质量高
- ✅ 支持 RAG 知识库检索

**缺点**：
- ❌ 需要申请 API Key
- ❌ 需要付费（通义千问约 0.008 元/千 tokens）
- ❌ 依赖网络连接

**配置步骤**：

#### 1. 申请 DashScope API Key

访问：https://dashscope.console.aliyun.com/

1. 注册/登录阿里云账号
2. 开通 DashScope 服务
3. 创建 API Key
4. 复制 API Key（格式：`sk-xxxxxxxxxxxxxx`）

#### 2. 配置环境变量

```bash
cd backend

# 编辑 .env 文件
nano .env

# 替换为真实的 API Key
DASHSCOPE_API_KEY="sk-your-real-api-key-here"
```

#### 3. 重启后端服务

```bash
# 停止当前服务（Ctrl+C）
# 重新启动
uvicorn main:app --reload
```

#### 4. 验证配置

```bash
# 查看日志，应该看到成功调用 AI 服务
# 而不是 "using fallback" 的警告
```

---

## 🔍 如何判断当前使用的模式

### 方法 1: 查看后端日志

**Fallback 模式**：
```
WARNING: AI generation failed: ..., using fallback
WARNING: Outline generation failed: ..., using fallback
```

**真实 AI 模式**：
```
INFO: Calling AI service to generate courseware content
INFO: generation_task_completed: task_id=xxx
```

### 方法 2: 查看生成的内容

**Fallback 模式**：
- 内容是固定的模板
- 标题是项目名称的前 50 个字符
- 章节固定为：导入、核心内容、练习与讨论、总结

**真实 AI 模式**：
- 内容根据项目描述定制
- 章节数量和内容灵活变化
- 包含具体的知识点和案例

---

## 📊 Fallback 机制详解

系统在以下情况会自动使用 fallback：

### 1. 大纲生成失败
```python
# services/courseware_ai.py
def _get_fallback_outline(user_requirements: str):
    return CoursewareOutline(
        title=user_requirements[:50],
        sections=[
            OutlineSection(title="导入", key_points=["引入主题", "激发兴趣"], slide_count=2),
            OutlineSection(title="核心内容", key_points=["重点概念", "案例分析"], slide_count=5),
            OutlineSection(title="练习与讨论", key_points=["课堂练习", "小组讨论"], slide_count=3),
            OutlineSection(title="总结", key_points=["回顾要点", "作业布置"], slide_count=2),
        ],
        total_slides=14,
    )
```

### 2. 课件内容生成失败
```python
def _get_fallback_courseware(user_requirements: str):
    title = user_requirements[:50] if user_requirements else "课件"
    
    ppt_content = f"""# {title}

---

# 导入
- 引入主题
- 激发兴趣

---

# 核心内容
- 重点概念
- 案例分析

---

# 练习与讨论
- 课堂练习
- 小组讨论

---

# 总结
- 回顾要点
- 作业布置
"""
    
    lesson_plan = f"""# 教学目标
- 完成{title}的教学

# 教学重点
- 核心概念理解

# 教学难点
- 实践应用

# 教学过程
1. 导入（5分钟）
2. 讲授（20分钟）
3. 练习（10分钟）
4. 总结（5分钟）
"""
    
    return CoursewareContent(
        title=title,
        markdown_content=ppt_content,
        lesson_plan_markdown=lesson_plan,
    )
```

---

## 🧪 测试两种模式

### 测试 Fallback 模式

1. 确保 `.env` 中的 API Key 是占位符
2. 创建项目：`Python 基础教程`
3. 生成课件
4. 查看生成的内容是否是固定模板

### 测试真实 AI 模式

1. 配置真实的 API Key
2. 创建项目：`Python 基础教程 - 介绍变量、数据类型、条件语句和循环`
3. 生成课件
4. 查看生成的内容是否根据描述定制

---

## 💰 成本估算（真实 AI 模式）

### 通义千问定价（2026-02）

| 模型 | 输入价格 | 输出价格 |
|------|---------|---------|
| qwen-plus | 0.004 元/千 tokens | 0.012 元/千 tokens |
| qwen-turbo | 0.002 元/千 tokens | 0.006 元/千 tokens |

### 单次生成成本

**典型场景**：生成一个 15 页的 PPT + Word 教案

- 输入 tokens：约 1000（用户需求 + Prompt）
- 输出 tokens：约 2000（课件内容）
- 总成本：约 0.004 + 0.024 = **0.028 元**（不到 3 分钱）

**MVP 演示成本**：
- 10 次生成测试：约 0.3 元
- 100 次生成：约 3 元

---

## 🎯 MVP 演示建议

### 方案 1: 纯 Fallback 模式（推荐）

**适用场景**：
- 快速演示系统功能
- 无需展示 AI 智能性
- 预算有限

**优点**：
- 零成本
- 稳定可靠
- 响应快速

### 方案 2: 混合模式

**适用场景**：
- 需要展示 AI 能力
- 有少量预算（几元）

**操作**：
1. 准备 2-3 个精心设计的项目描述
2. 使用真实 AI 模式生成这些项目
3. 演示时直接展示已生成的结果
4. 其他测试使用 Fallback 模式

### 方案 3: 完全真实 AI 模式

**适用场景**：
- 正式产品演示
- 需要展示完整功能

**成本**：约 3-5 元（100 次生成）

---

## ❓ 常见问题

### Q1: 为什么我的生成内容总是一样的？

**A**: 你正在使用 Fallback 模式。这是正常的，系统会使用预设模板。如果需要智能生成，请配置真实的 API Key。

### Q2: 配置了 API Key 但还是使用 Fallback？

**A**: 检查以下几点：
1. API Key 格式是否正确（`sk-` 开头）
2. 是否重启了后端服务
3. 查看后端日志是否有错误信息
4. 确认 API Key 是否有效（未过期、有余额）

### Q3: 真实 AI 模式生成失败怎么办？

**A**: 系统会自动回退到 Fallback 模式，不会影响用户体验。失败原因可能是：
- 网络问题
- API Key 无效
- 余额不足
- 请求频率过高

### Q4: 可以使用其他 LLM 吗（如 GPT-4）？

**A**: 可以！系统使用 LiteLLM，支持多种模型：

```bash
# 使用 OpenAI GPT-4
DEFAULT_MODEL="gpt-4"
OPENAI_API_KEY="sk-your-openai-key"

# 使用 Claude
DEFAULT_MODEL="claude-3-opus-20240229"
ANTHROPIC_API_KEY="sk-your-anthropic-key"
```

---

## 📝 总结

**MVP 演示推荐配置**：
- ✅ 使用 Fallback 模式（无需配置）
- ✅ 重点展示系统流程和 UI
- ✅ 说明"AI 生成功能已实现，演示使用模板"

**如果有预算**：
- 配置真实 API Key
- 准备 2-3 个精心设计的演示案例
- 展示 AI 智能生成能力

---

*配置指南版本: 1.0 | 分支: feat/mvp-integration*
