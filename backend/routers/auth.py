"""Authentication router backed by Limora cookie sessions."""

from fastapi import APIRouter, Depends, Request, Response

from schemas.auth import (
    AuthData,
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UserInfo,
    UserInfoData,
    UserInfoResponse,
)
from services.identity_service import identity_service
from services.platform.limora_client import build_limora_client, merge_cookie_headers
from utils.dependencies import get_current_user
from utils.exceptions import (
    APIException,
    ErrorCode,
    ExternalServiceException,
    UnauthorizedException,
)
from utils.responses import success_response

router = APIRouter(prefix="/auth", tags=["Auth"])


def _build_auth_data(user) -> AuthData:
    return AuthData(user=UserInfo.model_validate(user))


def _append_set_cookie_headers(response: Response, set_cookie_headers: list[str]) -> None:
    for header in set_cookie_headers:
        response.headers.append("set-cookie", header)


def _error_code_from_status(status_code: int) -> ErrorCode:
    if status_code == 400:
        return ErrorCode.INVALID_INPUT
    if status_code == 401:
        return ErrorCode.INVALID_CREDENTIALS
    if status_code == 409:
        return ErrorCode.ALREADY_EXISTS
    if status_code >= 500:
        return ErrorCode.UPSTREAM_UNAVAILABLE
    return ErrorCode.EXTERNAL_SERVICE_ERROR


def _error_message_from_payload(payload: dict) -> str:
    error = payload.get("error")
    if isinstance(error, dict):
        message = str(error.get("message") or "").strip()
        if message:
            return message
    message = str(payload.get("message") or "").strip()
    return message or "身份服务请求失败"


def _require_limora_client():
    client = build_limora_client()
    if client is None:
        raise ExternalServiceException(
            message="Limora 身份服务未启用",
            status_code=503,
            error_code=ErrorCode.UPSTREAM_CONFIG_ERROR,
            retryable=False,
        )
    return client


async def _mirror_current_identity(
    *,
    request: Request,
    response: Response,
    preferred_username: str | None = None,
):
    client = _require_limora_client()
    merged_cookie_header = merge_cookie_headers(
        request.headers.get("cookie"),
        response.headers.getlist("set-cookie"),
    )
    current = await client.get_current_session(cookie_header=merged_cookie_header)
    return await identity_service.upsert_identity_user(
        identity_id=current.identity_id,
        email=current.email,
        display_name=current.name,
        preferred_username=preferred_username,
    )


def _raise_upstream(response_status: int, payload: dict) -> None:
    raise APIException(
        status_code=response_status,
        error_code=_error_code_from_status(response_status),
        message=_error_message_from_payload(payload),
        details={"limora": payload},
    )


@router.post("/register", response_model=AuthResponse)
async def register(request: Request, response: Response, body: RegisterRequest):
    """Register through Limora and mirror the identity locally."""
    client = _require_limora_client()
    upstream = await client.sign_up_email(
        email=body.email,
        password=body.password,
        name=body.fullName or body.username,
        cookie_header=request.headers.get("cookie"),
        origin=request.headers.get("origin"),
    )
    _append_set_cookie_headers(response, upstream.set_cookie_headers)
    if upstream.status_code >= 400:
        _raise_upstream(upstream.status_code, upstream.payload)

    user = await _mirror_current_identity(
        request=request,
        response=response,
        preferred_username=body.username,
    )
    return success_response(
        data=_build_auth_data(user).model_dump(mode="json"),
        message="注册成功",
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: Request, response: Response, body: LoginRequest):
    """Login through Limora and mirror the identity locally."""
    client = _require_limora_client()
    upstream = await client.sign_in_email(
        email=body.email,
        password=body.password,
        cookie_header=request.headers.get("cookie"),
        origin=request.headers.get("origin"),
    )
    _append_set_cookie_headers(response, upstream.set_cookie_headers)
    if upstream.status_code >= 400:
        _raise_upstream(upstream.status_code, upstream.payload)

    user = await _mirror_current_identity(request=request, response=response)
    return success_response(
        data=_build_auth_data(user).model_dump(mode="json"),
        message="登录成功",
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    _: str = Depends(get_current_user),
):
    """Logout the current Limora-backed session."""
    client = _require_limora_client()
    upstream = await client.revoke_current_session(
        cookie_header=request.headers.get("cookie"),
        origin=request.headers.get("origin"),
    )
    _append_set_cookie_headers(response, upstream.set_cookie_headers)
    if upstream.status_code >= 400:
        _raise_upstream(upstream.status_code, upstream.payload)

    return success_response(data={}, message="退出登录成功")


@router.get("/me", response_model=UserInfoResponse)
async def me(current_user: str = Depends(get_current_user)):
    """Get current user profile."""
    user = await identity_service.get_user_by_id(current_user)
    if not user:
        raise UnauthorizedException(
            message="当前身份不存在本地镜像",
            error_code=ErrorCode.UNAUTHORIZED,
        )

    return success_response(
        data=UserInfoData(user=UserInfo.model_validate(user)).model_dump(mode="json"),
        message="获取用户信息成功",
    )
