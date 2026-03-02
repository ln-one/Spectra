# Error Handling

## 异常层次

```python
# utils/exceptions.py
class ServiceException(Exception):
 """服务异常基类"""
 def __init__(self, message: str, status_code: int = 500):
 self.message = message
 self.status_code = status_code
 super().__init__(self.message)

class DatabaseException(ServiceException):
 """数据库异常"""
 def __init__(self, message: str):
 super().__init__(message, status_code=500)

class AIServiceException(ServiceException):
 """AI 服务异常"""
 def __init__(self, message: str):
 super().__init__(message, status_code=502)

class ParseException(ServiceException):
 """解析异常"""
 def __init__(self, message: str):
 super().__init__(message, status_code=422)

class AuthenticationException(ServiceException):
 """认证异常"""
 def __init__(self, message: str = "Authentication failed"):
 super().__init__(message, status_code=401)

class AuthorizationException(ServiceException):
 """授权异常"""
 def __init__(self, message: str = "Access denied"):
 super().__init__(message, status_code=403)

class ValidationException(ServiceException):
 """验证异常"""
 def __init__(self, message: str):
 super().__init__(message, status_code=400)

class RateLimitException(ServiceException):
 """限流异常"""
 def __init__(self, message: str = "Rate limit exceeded"):
 super().__init__(message, status_code=429)
```

## 全局异常处理

```python
# main.py
from fastapi import Request
from fastapi.responses import JSONResponse
from utils.exceptions import ServiceException
import logging

logger = logging.getLogger(__name__)

@app.exception_handler(ServiceException)
async def service_exception_handler(
 request: Request, 
 exc: ServiceException
):
 """处理业务异常"""
 logger.error(
 f"Service error: {exc.message}",
 extra={
 "path": request.url.path,
 "method": request.method,
 "status_code": exc.status_code
 }
 )
 
 return JSONResponse(
 status_code=exc.status_code,
 content={
 "success": False,
 "error": {
 "code": exc.code or "UNKNOWN_ERROR",
 "message": exc.message,
 "details": {}
 },
 "message": exc.message
 }
 )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
 """处理未捕获的异常"""
 logger.error(
 f"Unhandled error: {str(exc)}",
 exc_info=True,
 extra={
 "path": request.url.path,
 "method": request.method
 }
 )
 
 return JSONResponse(
 status_code=500,
 content={
 "success": False,
 "error": {
 "code": "INTERNAL_ERROR",
 "message": "Internal server error",
 "details": {}
 },
 "message": "服务器内部错误"
 }
 )
```

## 使用示例

```python
# services/database.py
from utils.exceptions import DatabaseException

async def get_project(self, project_id: str):
 """获取项目"""
 try:
 project = await self.prisma.project.find_unique(
 where={"id": project_id}
 )
 if not project:
 raise DatabaseException(f"Project {project_id} not found")
 return project
 except Exception as e:
 logger.error(f"Database error: {str(e)}")
 raise DatabaseException("Failed to fetch project")
```

## 错误响应格式

```json
{
 "success": false,
 "error": {
 "code": "ERROR_CODE",
 "message": "详细错误描述",
 "details": {}
 },
 "message": "用户友好的错误消息"
}
```

## 错误码设计

```python
# utils/error_codes.py
class ErrorCode:
 """错误码定义"""
 # 认证相关 (1xxx)
 INVALID_TOKEN = "1001"
 TOKEN_EXPIRED = "1002"
 INVALID_CREDENTIALS = "1003"
 
 # 权限相关 (2xxx)
 ACCESS_DENIED = "2001"
 INSUFFICIENT_PERMISSIONS = "2002"
 
 # 业务相关 (3xxx)
 PROJECT_NOT_FOUND = "3001"
 INVALID_FILE_TYPE = "3002"
 GENERATION_FAILED = "3003"
 
 # 限流相关 (4xxx)
 RATE_LIMIT_EXCEEDED = "4001"
 
 # 系统相关 (5xxx)
 DATABASE_ERROR = "5001"
 AI_SERVICE_ERROR = "5002"
 EXTERNAL_SERVICE_ERROR = "5003"
```

## 相关文档

- [Logging](./logging.md) - 日志记录
- [Security](./security.md) - 安全异常处理
