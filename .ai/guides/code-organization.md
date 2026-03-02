# 代码组织规范

> 最后更新：2026-02-26 | 版本：1.0 
> 任务类型：backend | 预估 tokens：300

## 核心原则

**一个文件干一件事** - 便于 AI 理解和维护

---

## 文件行数限制

| 文件类型 | 行数限制 | 示例 |
|---------|---------|------|
| 类型定义 | <100 行 | `types.py` |
| 工具函数 | <150 行 | `utils.py` |
| 业务逻辑 | <200 行 | `processor.py` |
| 路由文件 | <200 行 | `router.py` |

---

## 何时拆分？

满足以下**任一条件**时必须拆分：

1. **行数超标** - 超过上述限制
2. **职责混杂** - 一个文件做多件事
3. **难以理解** - 需要滚动多次才能看完

---

## 如何拆分？

### 错误：机械拆分

```
service.py (300 行)
 ↓
service/
├── part1.py # 前 100 行
├── part2.py # 中 100 行
└── part3.py # 后 100 行
```

### 正确：按职责拆分

```
service.py (300 行)
 ↓
service/
├── __init__.py # 主服务类（编排）
├── types.py # 数据类型
├── validator.py # 验证逻辑
└── processor.py # 处理逻辑
```

---

## 实际案例

### 路由文件拆分

**场景**：`generate.py` 已经 435 行，需要添加下载功能

** 错误做法**：
```python
# 直接在 generate.py 添加下载端点
# 文件变成 500+ 行
```

** 正确做法**：
```python
# 创建独立的 download.py
backend/routers/
├── generate.py # 生成相关端点
└── download.py # 下载相关端点（新建）
```

---

## 模板

### 独立路由文件

```python
"""
文件下载路由

职责：处理生成文件的下载请求
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

router = APIRouter(prefix="/generate/tasks", tags=["Generate"])
logger = logging.getLogger(__name__)


@router.get("/{task_id}/download")
async def download_courseware(
 task_id: str,
 file_type: str = Query(..., regex="^(ppt|word)$"),
 user_id: str = Depends(get_current_user),
):
 """下载生成的课件文件"""
 # 实现...
 pass
```

### 注册路由

```python
# routers/__init__.py
from .download import router as download_router

__all__ = ["download_router"]

# main.py
from routers import download_router

api_v1_router.include_router(download_router, tags=["Generate"])
```

---

## 检查清单

添加新功能前：

- [ ] 目标文件是否已超过行数限制？
- [ ] 新功能是否与现有功能职责不同？
- [ ] 如果是，创建新文件而不是修改现有文件

---

## 相关文档

- `docs/standards/backend.md` - 完整的后端规范
- `docs/standards/frontend.md` - 前端规范
