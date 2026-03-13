"""
Unified Response Format

Provides helper functions to create standardized API responses.
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel


class SuccessResponse(BaseModel):
    """Standard success response format"""

    success: bool = True
    data: Any
    message: str = "操作成功"


class ErrorResponse(BaseModel):
    """Standard error response format"""

    success: bool = False
    error: Dict[str, Any]
    message: str


def success_response(data: Any, message: str = "操作成功") -> Dict[str, Any]:
    """
    Create a success response

    Args:
        data: Response data
        message: Success message

    Returns:
        Standardized success response dict

    Example:
        >>> success_response({"user": {"id": "123"}}, "用户创建成功")
        {
            "success": True,
            "data": {"user": {"id": "123"}},
            "message": "用户创建成功"
        }
    """
    return {"success": True, "data": data, "message": message}


def error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    root_message: Optional[str] = None,
    retryable: Optional[bool] = None,
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create an error response

    Args:
        code: Error code
        message: Error message
        details: Optional error details
        root_message: Optional root-level message (defaults to "请求失败")

    Returns:
        Standardized error response dict

    Example:
        >>> error_response("UNAUTHORIZED", "未登录或登录已过期")
        {
            "success": False,
            "error": {
                "code": "UNAUTHORIZED",
                "message": "未登录或登录已过期"
            },
            "message": "请求失败"
        }

        >>> error_response("NOT_FOUND", "资源不存在", root_message="查询失败")
        {
            "success": False,
            "error": {
                "code": "NOT_FOUND",
                "message": "资源不存在"
            },
            "message": "查询失败"
        }
    """
    error_dict = {"code": code, "message": message}
    if details:
        error_dict["details"] = details
    if retryable is not None:
        error_dict["retryable"] = retryable
    if trace_id:
        error_dict["trace_id"] = trace_id

    return {
        "success": False,
        "error": error_dict,
        "message": root_message or "请求失败",
    }


# TODO: Create response wrapper decorator
# This decorator can automatically wrap route responses in the standard format
# Example:
# @router.get("/users")
# @wrap_response
# async def get_users():
#     return {"users": [...]}  # Will be wrapped in success_response()
