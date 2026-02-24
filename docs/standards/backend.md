# 后端代码规范

> 详细规约见 [CONTRIBUTING.md](../CONTRIBUTING.md)

## 技术栈

- FastAPI
- Python 3.11
- Pydantic v2
- Prisma ORM
- SQLite

## 命名规范

- 文件: `snake_case.py`
- 类: `PascalCase`
- 函数: `snake_case`
- 常量: `UPPER_SNAKE_CASE`
- 模块文件夹: `snake_case/`

## 代码风格

- Black + PEP 8
- 4 空格缩进
- Type hints 必须
- 完整的 docstring

## 目录结构

```
routers/      # API 路由
services/     # 业务逻辑
schemas/      # Pydantic 数据模型
utils/        # 工具函数
prisma/       # 数据库
```

## 单一职责原则（SRP）

**核心理念**：一个文件只做一件事，便于 AI 理解和维护。

### 文件类型与职责

| 文件类型 | 职责 | 行数限制 | 示例 |
|---------|------|---------|------|
| **类型定义** | 数据模型、枚举、配置类 | <100 行 | `types.py`, `models.py` |
| **工具函数** | 纯函数、辅助方法 | <150 行 | `utils.py`, `helpers.py` |
| **业务逻辑** | 单一功能实现 | <200 行 | `processor.py`, `generator.py` |
| **服务编排** | 组合多个模块 | <150 行 | `__init__.py`, `service.py` |
| **API 路由** | 端点定义 | <200 行 | `router.py` |
| **测试文件** | 单元测试、集成测试 | <200 行 | `test_*.py` |

### 代码示例

```python
from typing import List
from pydantic import BaseModel

class Message(BaseModel):
    """消息模型 - 只定义数据结构"""
    content: str
    role: str

async def process_message(
    message: Message,
    context: List[Message]
) -> str:
    """
    处理用户消息 - 单一功能
    
    Args:
        message: 用户消息
        context: 对话上下文
        
    Returns:
        AI生成的回复
    """
    pass
```

## 模块化拆分规则

### 何时拆分？

满足以下**任一条件**时，必须拆分为模块：

1. **行数超标**：
   - 类型定义文件 >100 行
   - 工具函数文件 >150 行
   - 业务逻辑文件 >200 行
   - 测试文件 >200 行（建议）

2. **职责混杂**：
   - 一个文件包含多个不相关的类或函数
   - 数据模型和业务逻辑混在一起
   - 工具函数和服务逻辑混在一起

3. **难以理解**：
   - AI 或人类需要滚动多次才能理解全貌
   - 函数/类之间没有明确的逻辑关系

### 如何拆分？

**原则**：按职责拆分，不是按行数机械拆分

```
# ❌ 错误示例：机械拆分
service.py (300 行)
  ↓
service/
├── part1.py  # 前 100 行
├── part2.py  # 中 100 行
└── part3.py  # 后 100 行

# ✅ 正确示例：按职责拆分
service.py (300 行)
  ↓
service/
├── __init__.py      # 主服务类（编排）
├── types.py         # 数据类型定义
├── validator.py     # 输入验证逻辑
├── processor.py     # 核心处理逻辑
└── formatter.py     # 输出格式化
```

### 拆分模板

#### 1. 简单服务（<200 行）
```
service.py           # 单文件即可
```

#### 2. 中等服务（200-500 行）
```
service/
├── __init__.py      # 主服务类（50-100 行）
├── types.py         # 类型定义（<100 行）
└── helpers.py       # 辅助函数（<150 行）
```

#### 3. 复杂服务（>500 行）
```
service/
├── __init__.py      # 主服务类（编排）
├── types.py         # 数据类型
├── validator.py     # 验证逻辑
├── processor.py     # 处理逻辑
├── formatter.py     # 格式化
└── utils.py         # 工具函数
```

### 实际案例

**课件生成服务**（原 484 行 → 拆分为 5 个文件）

```
generation/
├── __init__.py           (144 行) - 主服务类，编排流程
├── types.py              (18 行)  - 数据类型定义
├── tool_checker.py       (97 行)  - 工具检测功能
├── marp_generator.py     (178 行) - PPTX 生成逻辑
└── pandoc_generator.py   (188 行) - DOCX 生成逻辑
```

**优势**：
- ✅ 每个文件职责清晰
- ✅ 易于 AI 理解和修改
- ✅ 便于单元测试
- ✅ 降低认知负担

## 测试文件组织规范

### 测试文件结构

**推荐：扁平化结构**（适合中小型项目）

```
tests/
├── conftest.py                    # pytest 配置和共享 fixtures
├── integration_fixtures.py        # 集成测试共享 fixtures
├── test_generation_service.py     # GenerationService 单元测试
├── test_template_marp.py          # Marp 模板测试
├── test_template_config.py        # 模板配置测试
├── test_exceptions.py             # 异常类测试
├── test_error_scenarios.py        # 错误场景测试
├── test_integration_pptx.py       # PPTX 集成测试
├── test_integration_docx.py       # DOCX 集成测试
└── test_integration_flow.py       # 完整流程测试
```

**优点**：
- ✅ 所有测试在一个目录，容易查找
- ✅ pytest 自动发现简单
- ✅ 符合 Python 测试惯例
- ✅ 适合中小型项目

**备选：镜像业务结构**（适合大型项目）

```
tests/
├── generation/
│   ├── test_service.py
│   ├── test_marp_generator.py
│   └── test_pandoc_generator.py
├── template/
│   ├── test_service.py
│   └── test_marp_template.py
└── integration/
    ├── test_pptx.py
    └── test_docx.py
```

**优点**：
- ✅ 结构清晰，镜像业务代码
- ✅ 大型项目更好管理
- ✅ 测试和代码对应关系明确

### 测试文件拆分原则

1. **按测试类型拆分**：
   - 单元测试：`test_<module>.py`
   - 集成测试：`test_integration_<feature>.py`
   - 端到端测试：`test_e2e_<flow>.py`

2. **按功能模块拆分**：
   - 一个测试文件对应一个业务模块
   - 例如：`test_generation_service.py` 测试 `GenerationService`

3. **按测试职责拆分**：
   - 异常测试：`test_exceptions.py`
   - 错误场景：`test_error_scenarios.py`
   - 配置测试：`test_config.py`

### 测试文件命名规范

```python
# ✅ 推荐命名
test_generation_service.py      # 测试 GenerationService
test_template_marp.py           # 测试 Marp 模板功能
test_integration_pptx.py        # PPTX 集成测试
test_exceptions.py              # 异常类测试

# ❌ 避免命名
test_1.py                       # 无意义命名
generation_test.py              # 不符合 pytest 规范
test_all.py                     # 职责不清
```

### 共享 Fixtures 组织

```python
# conftest.py - pytest 全局配置
import pytest

@pytest.fixture
def client():
    """API 测试客户端"""
    return TestClient(app)

# integration_fixtures.py - 集成测试专用
import pytest

@pytest.fixture
def integration_output_dir(tmp_path):
    """集成测试输出目录"""
    output_dir = tmp_path / "integration_output"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir

@pytest.fixture
def sample_courseware_content():
    """示例课件内容"""
    return CoursewareContent(...)
```

### 测试标记（Markers）

```python
# pytest.ini
[pytest]
markers =
    integration: marks tests as integration tests (require real tools)
    slow: marks tests as slow running
    unit: marks tests as unit tests

# 使用标记
import pytest

@pytest.mark.integration
class TestPPTXGeneration:
    """PPTX 集成测试"""
    pass

@pytest.mark.unit
class TestExceptions:
    """异常单元测试"""
    pass
```

### 运行测试

```bash
# 运行所有测试
pytest tests/ -v

# 只运行单元测试
pytest tests/ -v -m "not integration"

# 只运行集成测试
pytest tests/ -v -m integration

# 运行特定文件
pytest tests/test_generation_service.py -v

# 运行特定测试类
pytest tests/test_generation_service.py::TestGeneratePPTX -v
```


## 模块导入规范

### __init__.py 的作用

`__init__.py` 是模块的**门面**，负责：
1. 导出公共 API
2. 初始化全局实例
3. 简化外部导入

```python
# services/generation/__init__.py

from .types import CoursewareContent
from .service import GenerationService

# 创建全局实例（可选）
generation_service = GenerationService()

# 导出公共 API
__all__ = [
    'GenerationService',
    'CoursewareContent',
    'generation_service'
]
```

### 导入最佳实践

```python
# ✅ 推荐：从模块导入
from services.generation import GenerationService, CoursewareContent

# ✅ 推荐：使用全局实例
from services.generation import generation_service

# ❌ 避免：深层导入
from services.generation.service import GenerationService
```

## 文件组织原则

### 1. 类型定义文件（types.py）

**职责**：只定义数据结构，不包含逻辑

```python
# types.py (<100 行)
from enum import Enum
from pydantic import BaseModel

class Status(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"

class Task(BaseModel):
    id: str
    status: Status
    result: Optional[str] = None
```

### 2. 工具函数文件（utils.py / helpers.py）

**职责**：纯函数，无状态，可复用

```python
# utils.py (<150 行)
from pathlib import Path

def safe_path_join(base: Path, filename: str) -> Path:
    """安全的路径拼接，防止路径遍历"""
    safe_name = filename.replace('..', '').replace('/', '')
    return base / safe_name

def format_file_size(bytes: int) -> str:
    """格式化文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes < 1024:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024
    return f"{bytes:.1f} TB"
```

### 3. 业务逻辑文件（processor.py / generator.py）

**职责**：单一功能的实现

```python
# processor.py (<200 行)
import asyncio
from pathlib import Path

async def process_file(
    input_path: Path,
    output_path: Path
) -> str:
    """
    处理单个文件
    
    职责：
    1. 读取输入文件
    2. 执行转换
    3. 写入输出文件
    """
    # 实现细节...
    pass
```

### 4. 服务编排文件（__init__.py / service.py）

**职责**：组合多个模块，提供统一接口

```python
# __init__.py (<150 行)
from .types import Task, Status
from .processor import process_file
from .validator import validate_input

class TaskService:
    """任务服务 - 编排各个模块"""
    
    def __init__(self):
        self.tasks = {}
    
    async def create_task(self, input_data: dict) -> Task:
        """创建任务 - 编排验证和处理"""
        # 1. 验证输入
        validate_input(input_data)
        
        # 2. 创建任务
        task = Task(id=generate_id(), status=Status.PENDING)
        
        # 3. 异步处理
        asyncio.create_task(self._process_task(task))
        
        return task
    
    async def _process_task(self, task: Task):
        """处理任务 - 调用处理器"""
        result = await process_file(task.input, task.output)
        task.status = Status.COMPLETED
        task.result = result
```

## 代码质量检查清单

在提交代码前，检查以下项目：

### 单一职责
- [ ] 每个文件只做一件事
- [ ] 文件名清晰表达职责
- [ ] 函数/类名清晰表达功能

### 行数限制
- [ ] 类型定义文件 <100 行
- [ ] 工具函数文件 <150 行
- [ ] 业务逻辑文件 <200 行
- [ ] 服务编排文件 <150 行
- [ ] 测试文件 <200 行（建议）

### 可读性
- [ ] 有完整的 docstring
- [ ] 有类型提示
- [ ] 变量名清晰易懂
- [ ] 逻辑清晰，不需要注释也能理解

### 可测试性
- [ ] 函数职责单一，易于测试
- [ ] 避免全局状态
- [ ] 依赖可以 mock

### AI 友好性
- [ ] 文件不需要滚动太多就能看完
- [ ] 职责清晰，AI 容易理解
- [ ] 模块化，AI 容易修改单个功能

## API 规范

### RESTful
- URL: `/api/v1/资源名` (名词复数)
- 方法: GET/POST/PUT/PATCH/DELETE
- 状态码: 200/201/400/401/404/500

### 响应格式
```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

### 路由示例
```python
from fastapi import APIRouter, Depends
from app.schemas.chat import SendMessageRequest, MessageResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

@router.post("/messages", response_model=MessageResponse)
async def send_message(
    request: SendMessageRequest,
    chat_service: ChatService = Depends(get_chat_service)
):
    """发送消息并获取AI回复"""
    return await chat_service.process_message(request)
```

## 异步编程

- 所有 IO 操作使用 async/await
- 数据库查询使用异步
- 外部 API 调用使用异步

## 错误处理

```python
from fastapi import HTTPException, status

class ServiceException(Exception):
    """服务异常基类"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
```

## 性能优化

- 使用缓存
- 数据库查询优化
- API 响应 <500ms
- 实现分页

## 审核补充规则（2026-02-23）

- 认证依赖禁止返回固定用户ID；受保护路由必须基于 JWT 完整校验。
- `Idempotency-Key` 统一走 HTTP Header，不得以 Query 参数替代。
- Project 与 Auth 的请求/响应字段命名必须与 `docs/openapi.yaml` 单一口径一致。

## 规范设计理念

### 为什么要限制行数？

1. **认知负担**：人类和 AI 都有工作记忆限制
   - 短文件：一次性理解全貌
   - 长文件：需要反复滚动，容易遗漏

2. **修改风险**：文件越长，修改越容易出错
   - 短文件：影响范围小，容易验证
   - 长文件：牵一发动全身，难以预测影响

3. **AI 效率**：AI 处理短文件更准确
   - 短文件：上下文清晰，生成准确
   - 长文件：容易遗漏细节，产生错误

### 为什么强调单一职责？

1. **易于理解**：一个文件只做一件事，容易理解
2. **易于修改**：修改某个功能，只需要改一个文件
3. **易于测试**：职责单一，测试用例清晰
4. **易于复用**：功能独立，可以在其他地方使用

### 实践建议

1. **先写代码，再拆分**
   - 不要一开始就过度设计
   - 当文件变长或职责混杂时再拆分

2. **按职责拆分，不是按行数**
   - 不要机械地按行数切割
   - 要按功能和职责逻辑拆分

3. **保持导入简洁**
   - 使用 `__init__.py` 导出公共 API
   - 外部只需要知道模块名，不需要知道内部结构

4. **文档同步更新**
   - 拆分后更新 README
   - 说明模块结构和职责

## 参考案例

查看以下目录了解完整的模块化和测试实践：
- **业务代码**：`backend/services/generation/` 和 `backend/services/template/`
- **测试代码**：`backend/tests/` - 扁平化测试结构示例

