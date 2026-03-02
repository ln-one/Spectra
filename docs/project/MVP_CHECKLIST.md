# MVP 验证清单

> 更新时间：2026-03-02

## 验收目标

- [ ] 完整跑通一次端到端流程
- [ ] 记录关键日志与异常处理结果
- [ ] 产出演示可复现步骤

## API 清单

### 认证
- [x] `POST /auth/register`
- [x] `POST /auth/login`
- [x] `GET /auth/me`
- [x] `POST /auth/refresh`

### 项目
- [x] `POST /projects`
- [x] `GET /projects`
- [x] `GET /projects/{id}`

### 生成
- [x] `POST /generate/courseware`
- [x] `GET /generate/tasks/{id}/status`
- [x] `GET /generate/tasks/{id}/download`

## 页面清单

- [x] `/auth/login`
- [x] `/auth/register`
- [x] `/projects`
- [x] `/projects/new`
- [x] `/projects/[id]`
- [x] `/projects/[id]/generate`

## 端到端手工回归

- [ ] 注册成功
- [ ] 登录成功
- [ ] 创建项目成功
- [ ] 生成课件成功
- [ ] 下载 PPT 成功
- [ ] 下载 Word 成功

## 错误场景

- [ ] 未登录访问受保护页面跳转登录
- [ ] 重复注册返回冲突提示
- [ ] 密码错误返回认证失败
- [ ] 未完成任务下载被拦截

## 回归命令

```bash
# 后端
cd backend && source venv/bin/activate && uvicorn main:app --reload

# 前端
cd frontend && npm run dev

# 可选脚本
./test_integration.sh
```
