# 测试指南

> 项目测试规范和使用说明

## 测试框架

### 后端 (Python)

- **pytest** - Python 测试框架
- **pytest-asyncio** - 异步测试支持
- **httpx** - HTTP 客户端测试

### 前端 (TypeScript)

- **Jest** - JavaScript 测试框架
- **React Testing Library** - React 组件测试

## 运行测试

### 后端测试

```bash
cd backend

# 激活虚拟环境
source venv/bin/activate

# 安装开发依赖
pip install -r requirements-dev.txt

# 运行所有测试
pytest

# 运行并显示详细输出
pytest -v

# 运行特定测试文件
pytest tests/test_api.py

# 运行特定测试函数
pytest tests/test_api.py::test_health_check

# 运行并生成覆盖率报告
pytest --cov=. --cov-report=html
```

### 前端测试

```bash
cd frontend

# 安装依赖（包含测试依赖）
npm install

# 运行所有测试
npm test

# 监视模式（开发时推荐）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 测试目录结构

### 后端

```
backend/
├── tests/
│   ├── conftest.py      # 共享 fixtures
│   ├── test_api.py      # API 路由测试
│   └── test_services.py # 服务层测试
└── pytest.ini           # pytest 配置
```

### 前端

```
frontend/
├── __tests__/
│   ├── example.test.tsx  # 示例测试
│   └── utils.test.ts     # 工具函数测试
├── jest.config.ts        # Jest 配置
└── jest.setup.ts         # Jest 初始化
```

## 编写测试

### 后端测试示例

```python
# tests/test_example.py
import pytest
from fastapi.testclient import TestClient
from main import app

def test_example(client):
    """测试示例"""
    response = client.get("/api/example")
    assert response.status_code == 200
    assert "data" in response.json()

@pytest.mark.asyncio
async def test_async_example():
    """异步测试示例"""
    result = await some_async_function()
    assert result is not None
```

### 前端测试示例

```typescript
// __tests__/component.test.tsx
import { render, screen } from '@testing-library/react'
import { MyComponent } from '@/components/MyComponent'

describe('MyComponent', () => {
  it('正确渲染标题', () => {
    render(<MyComponent title="测试标题" />)
    expect(screen.getByText('测试标题')).toBeInTheDocument()
  })

  it('处理点击事件', () => {
    const handleClick = jest.fn()
    render(<MyComponent onClick={handleClick} />)
    screen.getByRole('button').click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

## 测试命名规范

- 测试文件: `test_*.py` (Python) 或 `*.test.ts(x)` (TypeScript)
- 测试函数: `test_功能描述` (Python) 或 `it('功能描述', ...)` (TypeScript)
- 使用中文描述测试用例，提高可读性

## CI 集成

测试会在 CI 流程中自动运行，参见 [CI/CD 指南](./ci-cd.md)。

## 相关链接

- [pytest 文档](https://docs.pytest.org/)
- [Jest 文档](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
