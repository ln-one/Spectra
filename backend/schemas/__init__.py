from .auth import (
    AuthData,
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UserInfo,
    UserInfoData,
    UserInfoResponse,
)
from .courses import (
    ChapterSchema,
    CourseBase,
    CourseCreate,
    CourseResponse,
    GenerateRequest,
    GenerateResponse,
    ProjectBase,
    ProjectCreate,
    ProjectResponse,
    UploadResponse,
)

__all__ = [
    # Auth
    "RegisterRequest",
    "LoginRequest",
    "UserInfo",
    "AuthData",
    "AuthResponse",
    "UserInfoData",
    "UserInfoResponse",
    # Courses
    "ChapterSchema",
    "CourseBase",
    "CourseCreate",
    "CourseResponse",
    "ProjectBase",
    "ProjectCreate",
    "ProjectResponse",
    "UploadResponse",
    "GenerateRequest",
    "GenerateResponse",
]
