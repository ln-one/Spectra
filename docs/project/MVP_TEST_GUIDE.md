# MVP 测试指南

> 更新时间：2026-03-02

## 启动环境

```bash
# backend
cd backend
source venv/bin/activate
uvicorn main:app --reload

# frontend
cd frontend
npm run dev
```

## 健康检查

```bash
curl http://localhost:8000/health
# 预期: {"status":"healthy"}
```

## 手工测试流程

1. 注册并登录
2. 创建项目
3. 进入生成页面并发起生成
4. 等待任务完成
5. 下载 PPT 与 Word

## 预期结果清单

- [ ] 页面跳转正确
- [ ] 进度状态可见
- [ ] 生成成功后可下载
- [ ] 下载文件可正常打开

## 常见问题排查

- 后端未启动：检查 `backend` 终端日志
- 前端请求失败：检查 `NEXT_PUBLIC_API_URL`
- 下载失败：确认任务状态为 `completed`
- 生成失败：确认 Marp/Pandoc 可用

## 关联文档

- [MVP 验证清单](./MVP_CHECKLIST.md)
- [MVP AI 配置](./MVP_AI_CONFIG.md)
