"""
课件生成服务自定义异常

定义了生成过程中可能出现的各种错误类型
"""


class GenerationError(Exception):
    """生成错误基类"""

    def __init__(
        self, message: str, error_code: str = "GENERATION_ERROR", details: dict = None
    ):
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self):
        """转换为字典格式，便于 API 响应"""
        return {
            "error": self.error_code,
            "message": self.message,
            "details": self.details,
        }


class ToolNotFoundError(GenerationError):
    """工具未安装错误"""

    def __init__(self, tool_name: str, install_command: str = ""):
        message = f"{tool_name} is not installed or not found in PATH"
        details = {"tool": tool_name, "install_command": install_command}
        super().__init__(message, "TOOL_NOT_FOUND", details)


class ToolExecutionError(GenerationError):
    """工具执行错误"""

    def __init__(self, tool_name: str, stderr: str, return_code: int = 1):
        message = f"{tool_name} execution failed"
        details = {"tool": tool_name, "stderr": stderr, "return_code": return_code}
        super().__init__(message, "TOOL_EXECUTION_ERROR", details)


class FileSystemError(GenerationError):
    """文件系统错误"""

    def __init__(self, operation: str, path: str, reason: str):
        message = f"File system error during {operation}"
        details = {"operation": operation, "path": path, "reason": reason}
        super().__init__(message, "FILE_SYSTEM_ERROR", details)


class ValidationError(GenerationError):
    """输入验证错误"""

    def __init__(self, field: str, reason: str):
        message = f"Validation failed for field: {field}"
        details = {"field": field, "reason": reason}
        super().__init__(message, "VALIDATION_ERROR", details)


class TimeoutError(GenerationError):
    """超时错误"""

    def __init__(self, operation: str, timeout_seconds: int):
        message = f"Operation timeout: {operation}"
        details = {"operation": operation, "timeout_seconds": timeout_seconds}
        super().__init__(message, "TIMEOUT_ERROR", details)
