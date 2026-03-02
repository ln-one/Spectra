# 后端开发规范（简版）

> 更新时间：2026-03-02
> 目标：给出最小且可执行的后端约束。

## 1. 架构约束

- 分层：`router -> service -> data`
- Router 不写复杂业务逻辑
- Service 负责编排、异常语义化、外部调用

## 2. 代码约束

- 使用 Python type hints
- 请求/响应模型使用 Pydantic
- 公共错误使用统一响应格式
- 新增能力必须补最小测试

## 3. 文件组织

- 路由：`backend/routers/*.py`
- 业务：`backend/services/*.py`
- 模型：`backend/schemas/*.py`
- 工具：`backend/utils/*.py`
- 测试：`backend/tests/*.py`

## 4. 数据与安全

- 所有用户资源接口必须鉴权
- 查询项目/文件/任务时必须带用户边界检查
- 幂等接口需要支持 `Idempotency-Key`

## 5. 提交前检查

```bash
cd backend
black .
isort .
flake8 .
pytest
```
