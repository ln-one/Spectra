# Backend 测试结构

本目录使用 pytest，按测试目标分层，减少维护成本并提升可读性。

## 目录结构

- `api/`：API 端点与中间件测试
- `services/`：服务层与业务逻辑测试
- `schemas/`：Schema/校验相关测试
- `unit/`：纯工具函数、规则、轻量逻辑
- `ai/`：AI 相关逻辑与适配测试
- `regression/`：回归与基线/质量类测试
- `e2e/`：端到端测试（可更慢）
- `integration/`：依赖真实工具/环境的集成测试
- `mocks/`：测试专用 Mock
- `integration_fixtures.py`：集成测试夹具
- `conftest.py`：通用夹具

## 运行测试

```bash
cd backend
python -m pytest tests/ -v
```

### 跑单个目录

```bash
python -m pytest tests/api -v
python -m pytest tests/services -v
python -m pytest tests/regression -v
```

### 标记过滤

```bash
python -m pytest tests/ -v -m "not integration"
python -m pytest tests/ -v -m integration
```

## 说明

- 集成测试依赖真实工具（如 Marp CLI、Pandoc）。
- 依赖真实 provider 凭据的测试应在凭据缺失时显式 `skip`，不要把本机环境偶然通过当作默认门禁。
- 回归测试用于保护质量指标和行为一致性。

