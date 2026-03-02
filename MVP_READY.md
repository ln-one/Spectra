# MVP 状态

> 更新时间：2026-03-02

## 结论

- [x] MVP 代码主流程已打通
- [x] 本地可完成“注册/登录 -> 创建项目 -> 生成 -> 下载”
- [ ] 仍需按测试清单完成人工端到端验收记录

## 已实现范围

- [x] 认证 API：register/login/me/refresh
- [x] 项目 API：创建、列表、详情
- [x] 文件上传与管理
- [x] 课件生成与下载（PPTX/DOCX）
- [x] 前端核心页面（auth/projects/generate）
- [x] 基础 RAG 检索链路

## 测试状态

- [x] 前端测试通过（Jest）
- [x] 后端测试通过（pytest）
- [x] Lint/格式化检查通过
- [ ] 人工端到端回归记录

## 快速启动

```bash
# 后端
cd backend
source venv/bin/activate
uvicorn main:app --reload

# 前端（新终端）
cd frontend
npm run dev
```

## 演示最小脚本

1. 注册新用户并登录
2. 创建项目
3. 发起生成任务
4. 下载 PPT 与 Word

## 相关文档

- [MVP 验证清单](./docs/project/MVP_CHECKLIST.md)
- [MVP 测试指南](./docs/project/MVP_TEST_GUIDE.md)
- [MVP AI 配置](./docs/project/MVP_AI_CONFIG.md)
- [技术栈（MVP 对齐版）](./docs/architecture/tech-stack.md)
