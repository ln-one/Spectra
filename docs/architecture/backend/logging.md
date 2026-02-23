# Logging Design
<!-- REVIEW #B10 (P2): 文档示例以 utils/logging_config.py + 文件轮转 + 中间件为主，但当前代码使用 backend/utils/logger.py 的简化实现（仅配置 console handler）。 -->

## 日志配置

```python
# utils/logging_config.py
import logging
import sys
from logging.handlers import RotatingFileHandler

def setup_logging():
    """配置日志系统"""
    # 创建 logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # 控制台输出
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(console_formatter)
    
    # 文件输出（自动轮转）
    file_handler = RotatingFileHandler(
        'logs/app.log',
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setLevel(logging.INFO)
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - '
        '%(pathname)s:%(lineno)d - %(message)s'
    )
    file_handler.setFormatter(file_formatter)
    
    # 添加 handlers
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    
    return logger
```

## 结构化日志

```python
# utils/structured_logging.py
import logging
import json
from datetime import datetime

class StructuredLogger:
    """结构化日志记录器"""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
    
    def log(
        self, 
        level: str, 
        message: str, 
        **kwargs
    ):
        """记录结构化日志"""
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message,
            **kwargs
        }
        
        log_method = getattr(self.logger, level.lower())
        log_method(json.dumps(log_data, ensure_ascii=False))
    
    def info(self, message: str, **kwargs):
        self.log("INFO", message, **kwargs)
    
    def error(self, message: str, **kwargs):
        self.log("ERROR", message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        self.log("WARNING", message, **kwargs)
```

## 使用示例

```python
# routers/chat.py
from utils.structured_logging import StructuredLogger

logger = StructuredLogger(__name__)

@router.post("/messages")
async def send_message(request: SendMessageRequest):
    """发送消息"""
    logger.info(
        "Processing chat message",
        project_id=request.project_id,
        user_id=current_user.id,
        message_length=len(request.content)
    )
    
    try:
        # 业务逻辑
        result = await ai_service.generate_chat_response(...)
        
        logger.info(
            "Chat message processed successfully",
            project_id=request.project_id,
            response_length=len(result["content"])
        )
        
        return result
    except Exception as e:
        logger.error(
            "Failed to process chat message",
            project_id=request.project_id,
            error=str(e),
            error_type=type(e).__name__
        )
        raise
```

## 请求日志中间件

```python
# middleware/logging_middleware.py
import time
import logging
from fastapi import Request

logger = logging.getLogger(__name__)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """记录所有 HTTP 请求"""
    start_time = time.time()
    
    # 记录请求
    logger.info(
        f"Request started: {request.method} {request.url.path}",
        extra={
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host
        }
    )
    
    # 处理请求
    response = await call_next(request)
    
    # 记录响应
    duration = time.time() - start_time
    logger.info(
        f"Request completed: {request.method} {request.url.path}",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration * 1000, 2)
        }
    )
    
    return response
```

## 敏感信息脱敏

```python
# utils/log_sanitizer.py
import re

def sanitize_log_data(data: dict) -> dict:
    """脱敏敏感信息"""
    sensitive_keys = ["password", "token", "api_key", "secret"]
    
    sanitized = {}
    for key, value in data.items():
        if any(s in key.lower() for s in sensitive_keys):
            sanitized[key] = "***REDACTED***"
        elif isinstance(value, dict):
            sanitized[key] = sanitize_log_data(value)
        else:
            sanitized[key] = value
    
    return sanitized
```

## 日志级别

- **DEBUG**: 详细的调试信息
- **INFO**: 一般信息（请求、响应、业务流程）
- **WARNING**: 警告信息（非致命错误）
- **ERROR**: 错误信息（需要关注的异常）
- **CRITICAL**: 严重错误（系统级故障）

## 日志存储

```
logs/
├── app.log           # 应用日志
├── app.log.1         # 轮转备份
├── app.log.2
├── error.log         # 错误日志
└── access.log        # 访问日志
```

## 生产环境配置

```python
# 生产环境使用 JSON 格式日志
import json_logging

json_logging.init_fastapi(enable_json=True)
json_logging.init_request_instrument(app)
```

## 相关文档

- [Error Handling](./error-handling.md) - 错误处理
- [Deployment](./deployment.md) - 部署配置
