"""
Auth Schemas

Request and response models for authentication endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    """用户注册请求"""

    email: EmailStr
    password: str = Field(min_length=8)
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    fullName: Optional[str] = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    """用户登录请求"""

    email: EmailStr
    password: str


class UserInfo(BaseModel):
    """用户信息"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str
    fullName: Optional[str] = None
    createdAt: datetime


class AuthData(BaseModel):
    """认证响应数据"""

    user: UserInfo


class AuthResponse(BaseModel):
    """认证响应（注册/登录）"""

    success: bool = True
    data: AuthData
    message: str = "操作成功"


class UserInfoData(BaseModel):
    """用户信息响应数据"""

    user: UserInfo


class UserInfoResponse(BaseModel):
    """用户信息响应"""

    success: bool = True
    data: UserInfoData
    message: str = "操作成功"
