"""
Capability Health Service — 能力健康检查与状态缓存。

提供统一的能力健康检查接口，支持短周期缓存。
"""

import logging
import os
import uuid
from datetime import datetime, timedelta
from importlib.util import find_spec
from typing import Dict

from schemas.common import (
    CapabilityStatus,
    CapabilityStatusEnum,
    CapabilityType,
    ReasonCode,
)

logger = logging.getLogger(__name__)

# 健康检查缓存（简单内存缓存，生产环境可替换为 Redis）
_health_cache: Dict[str, tuple[CapabilityStatus, datetime]] = {}

# 缓存有效期（秒）
CACHE_TTL = int(os.getenv("CAPABILITY_CHECK_INTERVAL", "300"))


def check_document_parser_health() -> CapabilityStatus:
    """检查文档解析能力健康状态"""
    cache_key = "health:document_parser"

    # 检查缓存
    if cache_key in _health_cache:
        cached_status, cached_time = _health_cache[cache_key]
        if datetime.now() - cached_time < timedelta(seconds=CACHE_TTL):
            return cached_status

    # 执行健康检查
    parser_name = os.getenv("DOCUMENT_PARSER", "local").strip().lower()

    try:
        from services.parsers import get_parser

        if parser_name == "auto":
            # auto 为路由模式，不是单一 provider。只要 local 可用，即可保证可运行。
            get_parser("local")
            status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider="auto",
                status=CapabilityStatusEnum.AVAILABLE,
                fallback_used=False,
            )
            _health_cache[cache_key] = (status, datetime.now())
            return status

        parser = get_parser(parser_name)

        # registry 可能将不可用 provider 自动回退到 local。
        # 此时应体现为 DEGRADED，而不是 AVAILABLE。
        if parser_name != "local" and parser.name != parser_name:
            status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider=parser.name,
                status=CapabilityStatusEnum.DEGRADED,
                fallback_used=True,
                fallback_target=parser.name,
                reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
                user_message=f"{parser_name} 暂不可用，已切换到 {parser.name}。",
                trace_id=f"trc_{uuid.uuid4().hex[:12]}",
            )
        else:
            status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider=parser.name,
                status=CapabilityStatusEnum.AVAILABLE,
                fallback_used=False,
            )

        # 更新缓存
        _health_cache[cache_key] = (status, datetime.now())
        return status

    except Exception as exc:
        logger.warning("文档解析能力检查失败: %s", exc)

        # 如果主 provider 不可用，检查 local 是否可用
        try:
            from services.parsers import get_parser

            get_parser("local")  # 验证 local 可用性

            status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider="local",
                status=CapabilityStatusEnum.DEGRADED,
                fallback_used=True,
                fallback_target="local",
                reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
                user_message=f"{parser_name} 暂不可用，已切换到本地解析。",
                trace_id=f"trc_{uuid.uuid4().hex[:12]}",
            )

            _health_cache[cache_key] = (status, datetime.now())
            return status

        except Exception:
            status = CapabilityStatus(
                capability=CapabilityType.DOCUMENT_PARSER,
                provider=parser_name,
                status=CapabilityStatusEnum.UNAVAILABLE,
                fallback_used=False,
                reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
                user_message="文档解析功能暂不可用。",
                trace_id=f"trc_{uuid.uuid4().hex[:12]}",
            )

            _health_cache[cache_key] = (status, datetime.now())
            return status


def check_video_understanding_health() -> CapabilityStatus:
    """检查视频理解能力健康状态"""
    cache_key = "health:video_understanding"

    # 检查缓存
    if cache_key in _health_cache:
        cached_status, cached_time = _health_cache[cache_key]
        if datetime.now() - cached_time < timedelta(seconds=CACHE_TTL):
            return cached_status

    # 执行健康检查
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if api_key:
        status = CapabilityStatus(
            capability=CapabilityType.VIDEO_UNDERSTANDING,
            provider="Qwen-VL",
            status=CapabilityStatusEnum.AVAILABLE,
            fallback_used=False,
        )
    else:
        status = CapabilityStatus(
            capability=CapabilityType.VIDEO_UNDERSTANDING,
            provider="Qwen-VL",
            status=CapabilityStatusEnum.UNAVAILABLE,
            fallback_used=False,
            reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
            user_message="视频理解功能暂不可用，请检查 DASHSCOPE_API_KEY 配置。",
            trace_id=f"trc_{uuid.uuid4().hex[:12]}",
        )

    _health_cache[cache_key] = (status, datetime.now())
    return status


def check_speech_recognition_health() -> CapabilityStatus:
    """检查语音识别能力健康状态"""
    cache_key = "health:speech_recognition"

    # 检查缓存
    if cache_key in _health_cache:
        cached_status, cached_time = _health_cache[cache_key]
        if datetime.now() - cached_time < timedelta(seconds=CACHE_TTL):
            return cached_status

    # 执行健康检查
    try:
        import faster_whisper  # noqa: F401

        status = CapabilityStatus(
            capability=CapabilityType.SPEECH_RECOGNITION,
            provider="Faster-Whisper",
            status=CapabilityStatusEnum.AVAILABLE,
            fallback_used=False,
        )
    except Exception as exc:
        logger.warning("语音识别能力检查失败: %s", exc)
        status = CapabilityStatus(
            capability=CapabilityType.SPEECH_RECOGNITION,
            provider="Faster-Whisper",
            status=CapabilityStatusEnum.UNAVAILABLE,
            fallback_used=False,
            reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
            user_message="语音识别功能暂不可用，请检查 faster-whisper 依赖。",
            trace_id=f"trc_{uuid.uuid4().hex[:12]}",
        )

    _health_cache[cache_key] = (status, datetime.now())
    return status


def check_animation_rendering_health() -> CapabilityStatus:
    """检查动画渲染能力健康状态。"""
    cache_key = "health:animation_rendering"

    if cache_key in _health_cache:
        cached_status, cached_time = _health_cache[cache_key]
        if datetime.now() - cached_time < timedelta(seconds=CACHE_TTL):
            return cached_status

    has_pillow = find_spec("PIL") is not None
    has_playwright = find_spec("playwright") is not None
    has_cv2 = find_spec("cv2") is not None

    if has_pillow and has_playwright and has_cv2:
        status = CapabilityStatus(
            capability=CapabilityType.ANIMATION_RENDERING,
            provider="Playwright+Pillow+OpenCV",
            status=CapabilityStatusEnum.AVAILABLE,
            fallback_used=False,
        )
    elif has_pillow and has_playwright:
        status = CapabilityStatus(
            capability=CapabilityType.ANIMATION_RENDERING,
            provider="Playwright+Pillow",
            status=CapabilityStatusEnum.AVAILABLE,
            fallback_used=False,
        )
    elif has_pillow:
        status = CapabilityStatus(
            capability=CapabilityType.ANIMATION_RENDERING,
            provider="Pillow",
            status=CapabilityStatusEnum.DEGRADED,
            fallback_used=True,
            fallback_target="server_side_gif",
            reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
            user_message=(
                "浏览器模板渲染不可用，已降级为服务端 GIF 模板渲染。"
            ),
            trace_id=f"trc_{uuid.uuid4().hex[:12]}",
        )
    else:
        status = CapabilityStatus(
            capability=CapabilityType.ANIMATION_RENDERING,
            provider="Playwright+Pillow",
            status=CapabilityStatusEnum.UNAVAILABLE,
            fallback_used=False,
            reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
            user_message="动画渲染功能暂不可用，请检查 Playwright 和 Pillow 依赖。",
            trace_id=f"trc_{uuid.uuid4().hex[:12]}",
        )

    _health_cache[cache_key] = (status, datetime.now())
    return status


def get_all_capabilities_health() -> Dict[str, CapabilityStatus]:
    """获取所有能力的健康状态"""
    return {
        "document_parser": check_document_parser_health(),
        "video_understanding": check_video_understanding_health(),
        "speech_recognition": check_speech_recognition_health(),
        "animation_rendering": check_animation_rendering_health(),
    }


def clear_health_cache():
    """清除健康检查缓存（用于测试或强制刷新）"""
    _health_cache.clear()
