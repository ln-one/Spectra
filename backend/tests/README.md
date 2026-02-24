# 课件生成系统测试文档

## 测试概述

本目录包含课件生成系统的单元测试和集成测试，使用 pytest 框架编写。

## 测试文件

### test_generation_service.py
测试 GenerationService 的核心功能：
- 服务初始化
- PPTX 生成（成功和失败场景）
- DOCX 生成（成功和失败场景）
- 文件路径安全性
- 并发生成

**测试数量**: 12 个测试
**测试类型**: 单元测试（使用 Mock）
**覆盖率**: GenerationService 的主要功能

### test_template_service.py
测试 TemplateService 的模板功能：
- 服务初始化
- Marp Frontmatter 生成（多种风格）
- Markdown 包装
- Pandoc 模板路径
- 配置验证
- CSS 生成
- 边界情况处理

**测试数量**: 24 个测试
**测试类型**: 单元测试
**覆盖率**: TemplateService 的所有公共方法

### test_error_handling.py
测试自定义异常和错误处理：
- GenerationError 基类
- ToolNotFoundError
- ToolExecutionError
- FileSystemError
- ValidationError
- TimeoutError
- 工具检测错误
- 错误继承关系
- 错误消息格式

**测试数量**: 28 个测试
**测试类型**: 单元测试
**覆盖率**: 所有自定义异常类

### test_generation_integration.py
测试完整的端到端生成流程：
- PPTX 生成（多种模板）
- DOCX 生成
- 完整生成流程
- 文件内容验证
- 性能测试
- 错误场景处理

**测试数量**: 14 个测试
**测试类型**: 集成测试（需要真实工具）
**依赖**: Marp CLI 和 Pandoc 必须已安装

## 运行测试

### 运行所有测试
```bash
cd backend
python -m pytest tests/ -v
```

### 运行单元测试（不需要真实工具）
```bash
python -m pytest tests/ -v -m "not integration"
```

### 运行集成测试（需要真实工具）
```bash
python -m pytest tests/ -v -m integration
```

### 运行特定测试文件
```bash
python -m pytest tests/test_generation_service.py -v
python -m pytest tests/test_template_service.py -v
python -m pytest tests/test_error_handling.py -v
python -m pytest tests/test_generation_integration.py -v
```

### 运行特定测试类
```bash
python -m pytest tests/test_generation_service.py::TestGeneratePPTX -v
```

### 运行特定测试
```bash
python -m pytest tests/test_generation_service.py::TestGeneratePPTX::test_generate_pptx_success -v
```

### 查看测试覆盖率
```bash
python -m pytest tests/ --cov=services.generation --cov=services.template --cov-report=html
```

## 测试策略

### 单元测试
- 使用 Mock 隔离外部依赖（Marp CLI、Pandoc）
- 测试成功和失败场景
- 验证错误处理和日志记录
- 测试边界情况和异常输入
- 快速执行，不依赖外部工具

### 集成测试
- 使用真实的 Marp CLI 和 Pandoc
- 验证完整的生成流程
- 测试文件格式有效性
- 测试性能指标
- 测试多种模板风格

## 测试覆盖

当前测试覆盖：
- ✅ GenerationService 核心功能（单元测试）
- ✅ TemplateService 模板功能（单元测试）
- ✅ 自定义异常类（单元测试）
- ✅ 错误处理逻辑（单元测试）
- ✅ 工具检测（单元测试）
- ✅ 端到端生成流程（集成测试）
- ✅ 文件格式验证（集成测试）
- ✅ 性能测试（集成测试）
- ⏳ API 端点测试（Phase 2B）

## 测试结果

最新测试运行结果：
```
78 passed, 6 warnings in 26.41s
- 64 单元测试
- 14 集成测试
```

所有测试通过 ✅

## 测试标记

使用 pytest 标记来分类测试：

- `@pytest.mark.integration`: 集成测试，需要真实工具
- 无标记: 单元测试，使用 Mock

## 注意事项

1. **Mock 使用**: 单元测试使用 Mock 避免依赖真实的 Marp CLI 和 Pandoc
2. **异步测试**: 使用 `@pytest.mark.asyncio` 标记异步测试
3. **临时目录**: 使用 pytest 的 `tmp_path` fixture 创建临时目录
4. **警告**: Pydantic 和其他库的 deprecation 警告可以忽略
5. **集成测试**: 需要先安装 Marp CLI 和 Pandoc

## 集成测试环境准备

运行集成测试前，确保安装以下工具：

### Marp CLI
```bash
npm install -g @marp-team/marp-cli
```

### Pandoc
```bash
# macOS
brew install pandoc

# Ubuntu/Debian
sudo apt-get install pandoc
```

### 验证安装
```bash
marp --version
pandoc --version
```

## 下一步

- ✅ 单元测试完成
- ✅ 集成测试完成
- [ ] 增加测试覆盖率到 90%+
- [ ] 添加性能基准测试
- [ ] 添加 API 端点测试（Phase 2B）
- [ ] 添加并发压力测试



