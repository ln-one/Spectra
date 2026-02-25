"""Authentication router."""

from fastapi import APIRouter, Depends

from schemas.auth import (
    AuthData,
    AuthResponse,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    UserInfo,
    UserInfoData,
    UserInfoResponse,
)
from services.auth_service import auth_service
from utils.dependencies import get_current_user
from utils.exceptions import ConflictException, ErrorCode, UnauthorizedException
from utils.responses import success_response

router = APIRouter(prefix="/auth", tags=["Auth"])


def _build_auth_data(user) -> AuthData:
    tokens = auth_service.create_auth_tokens(user.id)
    return AuthData(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        expires_in=tokens["expires_in"],
        user=UserInfo.model_validate(user),
    )


@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """Register a new user and return token pair."""
    exists_by_email = await auth_service.get_user_by_email(request.email)
    if exists_by_email:
        raise ConflictException(
            message="邮箱已注册",
            error_code=ErrorCode.ALREADY_EXISTS,
        )

    exists_by_username = await auth_service.get_user_by_username(request.username)
    if exists_by_username:
        raise ConflictException(
            message="用户名已存在",
            error_code=ErrorCode.ALREADY_EXISTS,
        )

    user = await auth_service.create_user(
        email=request.email,
        password=request.password,
        username=request.username,
        full_name=request.fullName,
    )
    return success_response(
        data=_build_auth_data(user).model_dump(mode="json"),
        message="注册成功",
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Login with email and password and return token pair."""
    user = await auth_service.authenticate_user(request.email, request.password)
    if not user:
        raise UnauthorizedException(
            message="邮箱或密码错误",
            error_code=ErrorCode.INVALID_CREDENTIALS,
        )

    return success_response(
        data=_build_auth_data(user).model_dump(mode="json"),
        message="登录成功",
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(request: RefreshTokenRequest):
    """Refresh access token using refresh token."""
    user_id = auth_service.verify_refresh_token(request.refresh_token)
    if not user_id:
        raise UnauthorizedException(
            message="刷新令牌无效或已过期",
            error_code=ErrorCode.INVALID_TOKEN,
        )

    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise UnauthorizedException(
            message="令牌无效或已过期",
            error_code=ErrorCode.INVALID_TOKEN,
        )

    return success_response(
        data=_build_auth_data(user).model_dump(mode="json"),
        message="刷新成功",
    )


@router.post("/logout")
async def logout(_: str = Depends(get_current_user)):
    """Logout current user (stateless MVP behavior)."""
    return success_response(data={}, message="退出登录成功")


@router.get("/me", response_model=UserInfoResponse)
async def me(current_user: str = Depends(get_current_user)):
    """Get current user profile."""
    user = await auth_service.get_user_by_id(current_user)
    if not user:
        raise UnauthorizedException(
            message="令牌无效或已过期",
            error_code=ErrorCode.INVALID_TOKEN,
        )

    return success_response(
        data=UserInfoData(user=UserInfo.model_validate(user)).model_dump(mode="json"),
        message="获取用户信息成功",
    )
