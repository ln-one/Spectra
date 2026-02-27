# MVP 测试指南

> 快速测试 MVP 完整流程 | 更新时间：2026-02-27

## 🚀 启动服务

### 1. 启动后端

```bash
cd backend

# 确保虚拟环境已激活
source venv/bin/activate  # macOS/Linux

# 启动 FastAPI 服务
uvicorn main:app --reload

# 预期输出：
# INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 2. 启动前端（新终端）

```bash
cd frontend

# 启动 Next.js 开发服务器
npm run dev

# 预期输出：
# ▲ Next.js 15.x.x
# - Local:        http://localhost:3000
```

### 3. 健康检查

```bash
# 后端健康检查
curl http://localhost:8000/health

# 预期响应：
# {"status":"healthy"}
```

---

## 📋 完整流程测试

### Step 1: 注册新用户

1. 访问 http://localhost:3000
2. 点击"立即注册"
3. 填写表单：
   - 邮箱：`test@example.com`
   - 用户名：`testuser`
   - 密码：`Test1234`（至少8位，包含字母和数字）
   - 确认密码：`Test1234`
4. 点击"注册"

**预期结果**：
- ✅ 注册成功提示
- ✅ 自动跳转到项目列表页 `/projects`

### Step 2: 登录（如果已注册）

1. 访问 http://localhost:3000/auth/login
2. 输入邮箱和密码
3. 点击"登录"

**预期结果**：
- ✅ 登录成功
- ✅ 跳转到项目列表页

### Step 3: 创建项目

1. 在项目列表页，点击"新建项目"
2. 填写项目信息：
   - 项目名称：`Python 基础教程`
   - 学科：`计算机科学`
   - 年级：`大学一年级`
   - 描述：`介绍 Python 编程基础知识，包括变量、函数、循环等`
3. 点击"创建项目"

**预期结果**：
- ✅ 项目创建成功
- ✅ 跳转到项目详情页

### Step 4: 生成课件

1. 在项目详情页，点击左侧导航的"生成"
2. 或直接访问 `/projects/{project_id}/generate`
3. 点击"开始生成"按钮

**预期结果**：
- ✅ 显示"生成任务已创建"提示
- ✅ 进度条开始显示
- ✅ 状态从"等待中" → "处理中" → "已完成"
- ✅ 进度从 0% → 100%
- ⏱️ 预计耗时：30-60 秒

### Step 5: 下载文件

1. 等待生成完成（进度 100%）
2. 点击"下载 PPT"按钮
3. 点击"下载 Word"按钮

**预期结果**：
- ✅ PPT 文件下载成功（.pptx 格式）
- ✅ Word 文件下载成功（.docx 格式）
- ✅ 文件可以正常打开

---

## 🧪 错误场景测试

### 测试 1: 未登录访问保护页面

1. 清除浏览器 localStorage（或使用无痕模式）
2. 直接访问 http://localhost:3000/projects

**预期结果**：
- ✅ 自动跳转到登录页 `/auth/login?redirect=/projects`

### 测试 2: 重复注册

1. 使用已注册的邮箱再次注册

**预期结果**：
- ✅ 显示"邮箱已注册"错误提示

### 测试 3: 错误密码登录

1. 输入正确邮箱，错误密码

**预期结果**：
- ✅ 显示"邮箱或密码错误"提示

### 测试 4: 下载未完成的任务

1. 生成任务进行中时，尝试访问下载链接

**预期结果**：
- ✅ 返回 400 错误："任务尚未完成"

---

## 🔍 调试技巧

### 查看后端日志

```bash
# 后端终端会实时显示请求日志
# 关注以下关键日志：

# 1. 用户注册
INFO: User registered: user_id=xxx

# 2. 生成任务创建
INFO: courseware_generation_started: task_id=xxx

# 3. 生成完成
INFO: generation_task_completed: task_id=xxx

# 4. 文件下载
INFO: courseware_downloaded: task_id=xxx, file_type=ppt
```

### 查看前端控制台

打开浏览器开发者工具（F12）：

```javascript
// 检查 localStorage 中的 token
localStorage.getItem('access_token')

// 查看 API 请求
// Network 标签 → 筛选 XHR/Fetch
```

### 检查生成的文件

```bash
# 后端生成的文件位置
ls -la backend/generated/

# 应该看到：
# {task_id}.pptx
# {task_id}_lesson_plan.docx
```

---

## ❌ 常见问题

### 问题 1: 后端启动失败

**症状**：`ModuleNotFoundError` 或 `ImportError`

**解决**：
```bash
cd backend
pip install -r requirements.txt
```

### 问题 2: 前端启动失败

**症状**：`Module not found` 或依赖错误

**解决**：
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### 问题 3: 生成失败

**症状**：任务状态变为 "failed"

**可能原因**：
1. Marp 未安装：`npm install -g @marp-team/marp-cli`
2. Pandoc 未安装：`brew install pandoc`（macOS）
3. AI 服务错误：检查后端日志

### 问题 4: 下载 404

**症状**：点击下载按钮返回 404

**检查**：
1. 确认文件已生成：`ls backend/generated/`
2. 确认任务状态为 "completed"
3. 检查浏览器 Network 标签的请求 URL

### 问题 5: CORS 错误

**症状**：前端控制台显示 CORS 错误

**解决**：
- 确认后端运行在 `http://localhost:8000`
- 确认前端运行在 `http://localhost:3000`
- 检查 `backend/main.py` 的 CORS 配置

---

## ✅ 测试完成清单

完成以下所有测试后，MVP 验证通过：

- [ ] 用户注册成功
- [ ] 用户登录成功
- [ ] 创建项目成功
- [ ] 生成课件成功（进度 100%）
- [ ] 下载 PPT 成功（文件可打开）
- [ ] 下载 Word 成功（文件可打开）
- [ ] 未登录跳转正常
- [ ] 错误提示正常显示

---

## 📹 录制演示视频

测试通过后，录制演示视频：

1. 使用 QuickTime（macOS）或 OBS Studio
2. 录制完整流程（5-10 分钟）
3. 包含以下场景：
   - 注册/登录
   - 创建项目
   - 生成课件（展示进度）
   - 下载并打开文件
4. 添加旁白说明功能

---

*测试指南版本: 1.0 | 分支: feat/mvp-integration*
