---
inclusion: always
---

# Spectra 项目规范

## AI 自主学习机制

**每次对话开始时，AI 必须**：
1. 主动分析用户意图和任务类型
2. 主动总结经验并提炼可复用规则
3. 主动更新 `docs/standards/` 相关文档
4. 禁止等用户重复说同样的问题
5. 根据实际需求参照`docs/architecture/`相关文档

## 规则优先级

```
1. docs/openapi.yaml          (API 契约)
2. docs/standards/            (代码规范)
3. .cursorrules (根目录)       (全局规约)
4. 子目录 .cursorrules         (团队自定义)
```

## 核心规则

### Commit 格式
```
<type>(<scope>): <subject>
```
Type: feat | fix | refactor | docs | style | test | chore

### 禁止事项
- 直接 Push 到 main
- 单文件 >300 行
- 单文档 >6000 字符
- 提交敏感信息

### 文档分类
- `.cursorrules` → 给 AI：规则、示例、命令
- `docs/` → 给人：理念、原因、流程

## 任务类型识别

根据用户请求，自动读取对应规范：
- **前端任务** → 读取 `frontend/.cursorrules` + `docs/standards/frontend.md`
- **后端任务** → 读取 `backend/.cursorrules` + `docs/standards/backend.md`
- **API 修改** → 读取 `docs/openapi.yaml`
- **文档任务** → 读取 `docs/.cursorrules` + `docs/standards/documentation.md`

## 工作流程

```
用户提问 → AI 识别任务类型 → 读取相关规范 → 执行任务 → 总结经验 → 更新规范
```
