# 集成测试说明

## 概述

集成测试用于验证前后端完整流程，但由于执行时间较长，已从 CI 和 pre-commit hook 中排除。

## 跳过集成测试

### Pre-commit Hook
Pre-commit hook 自动跳过集成测试：
```bash
pytest -m "not integration"
```

### CI/CD
GitHub Actions CI 也跳过集成测试：
```yaml
- name: Test
  run: pytest -m "not integration"
```

## 手动运行集成测试

### 后端集成测试
```bash
cd backend
pytest -m integration
```

### 前后端集成测试
使用提供的测试脚本：
```bash
# 确保后端和前端都在运行
./test_integration.sh
```

## 标记集成测试

在测试函数上添加 `@pytest.mark.integration` 装饰器：

```python
import pytest

@pytest.mark.integration
def test_full_workflow():
    """测试完整的用户流程"""
    # 测试代码...
```

## 测试分类

- **单元测试**：快速，无外部依赖，在 CI 中运行
- **集成测试**：较慢，需要真实工具（Marp、Pandoc），手动运行

## 相关文件

- `pytest.ini` - pytest 配置，定义 integration 标记
- `scripts/pre-commit.js` - pre-commit hook 脚本
- `.github/workflows/ci.yml` - CI 配置
- `test_integration.sh` - 前后端集成测试脚本
