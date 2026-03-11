# MVP AI 配置

> 更新时间：2026-03-02

## 运行模式

### 模式 A：Fallback（默认）

- [x] 无需 API Key
- [x] 可用于流程演示
- [ ] 内容智能性有限（模板化）

### 模式 B：真实 AI

- [x] 支持 DashScope（Qwen）
- [x] 可根据输入动态生成
- [ ] 依赖网络和 API Key

## 配置步骤

```bash
cd backend
cp .env.example .env
```

在 `.env` 中设置：

```bash
DASHSCOPE_API_KEY="your-api-key"
DEFAULT_MODEL="qwen-plus"
ALLOW_AI_STUB=false
```

## 模式判断

- 若无有效 API Key：自动走 fallback
- 若 API 调用失败：按服务回退策略执行

## 演示建议

- 流程演示优先：可直接使用 fallback
- 内容质量演示：切到真实 AI 模式

## 备注

当前技术栈与落地状态以 [技术栈文档](../architecture/tech-stack.md) 为准。
