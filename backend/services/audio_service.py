"""
Audio Service — 语音识别能力封装（基于 Faster-Whisper）。

对齐 D3_WHISPER_SPEC_V1.md 规范。
"""

import logging
import os
import uuid
import wave

from schemas.common import (
    CapabilityStatus,
    CapabilityStatusEnum,
    CapabilityType,
    ReasonCode,
)

logger = logging.getLogger(__name__)

# 环境变量配置
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")


def _safe_audio_duration(audio_path: str) -> float:
    """Best-effort duration probe for wav files."""
    try:
        with wave.open(audio_path, "rb") as wav_file:
            frame_rate = wav_file.getframerate() or 0
            frame_count = wav_file.getnframes() or 0
            if frame_rate <= 0:
                return 0.0
            return round(frame_count / frame_rate, 3)
    except Exception:
        return 0.0


def transcribe_audio(
    audio_path: str, language: str = "zh"
) -> tuple[str, float, float, CapabilityStatus]:
    """
    识别音频文件。

    Args:
        audio_path: 音频文件路径或音频数据
        language: 语言代码（默认中文）

    Returns:
        (text, confidence, duration, capability_status)
    """
    trace_id = f"trc_{uuid.uuid4().hex[:12]}"
    probed_duration = _safe_audio_duration(audio_path)

    try:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            capability_status = CapabilityStatus(
                capability=CapabilityType.SPEECH_RECOGNITION,
                provider="Faster-Whisper",
                status=CapabilityStatusEnum.UNAVAILABLE,
                fallback_used=True,
                fallback_target="manual_text_input",
                reason_code=ReasonCode.PROVIDER_UNAVAILABLE,
                user_message="语音识别能力暂不可用，请改用文本输入或稍后重试。",
                trace_id=trace_id,
            )
            return "", 0.0, probed_duration, capability_status

        model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )
        segments, info = model.transcribe(
            audio_path,
            language=language,
            vad_filter=True,
            beam_size=5,
        )

        texts = [
            seg.text.strip() for seg in segments if getattr(seg, "text", "").strip()
        ]
        text = " ".join(texts).strip()
        confidence = float(getattr(info, "language_probability", 0.0) or 0.0)
        confidence = max(0.0, min(confidence, 1.0))
        duration = float(getattr(info, "duration", 0.0) or 0.0) or probed_duration

        if not text:
            capability_status = CapabilityStatus(
                capability=CapabilityType.SPEECH_RECOGNITION,
                provider="Faster-Whisper",
                status=CapabilityStatusEnum.DEGRADED,
                fallback_used=True,
                fallback_target="manual_text_input",
                reason_code=ReasonCode.EMPTY_OUTPUT,
                user_message="语音识别未提取到有效文本，请补充文本描述。",
                trace_id=trace_id,
            )
            return "", confidence, duration, capability_status

        capability_status = CapabilityStatus(
            capability=CapabilityType.SPEECH_RECOGNITION,
            provider="Faster-Whisper",
            status=CapabilityStatusEnum.AVAILABLE,
            fallback_used=False,
            fallback_target=None,
            reason_code=None,
            user_message=None,
            trace_id=trace_id,
        )

        return text, confidence, duration, capability_status

    except Exception as exc:
        logger.error("语音识别失败: %s", exc, exc_info=True)

        reason_code = ReasonCode.INTERNAL_ERROR
        exc_text = str(exc).lower()
        if "timeout" in exc_text:
            reason_code = ReasonCode.PROVIDER_TIMEOUT
        elif "rate" in exc_text or "429" in exc_text:
            reason_code = ReasonCode.PROVIDER_RATE_LIMITED

        capability_status = CapabilityStatus(
            capability=CapabilityType.SPEECH_RECOGNITION,
            provider="Faster-Whisper",
            status=CapabilityStatusEnum.DEGRADED,
            fallback_used=True,
            fallback_target="manual_text_input",
            reason_code=reason_code,
            user_message="语音识别失败，请改用文本输入或稍后重试。",
            trace_id=trace_id,
        )

        return "", 0.0, probed_duration, capability_status
