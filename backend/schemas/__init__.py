from .auth import (
    AuthData,
    AuthResponse,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    UserInfo,
    UserInfoData,
    UserInfoResponse,
)
from .chat import (
    GetMessagesResponse,
    Message,
    SendMessageRequest,
    SendMessageResponse,
    VoiceMessageResponse,
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
    # Chat
    "Message",
    "SendMessageRequest",
    "SendMessageResponse",
    "GetMessagesResponse",
    "VoiceMessageResponse",
    # Auth
    "RegisterRequest",
    "LoginRequest",
    "RefreshTokenRequest",
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
