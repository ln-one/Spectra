from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from schemas.project_space import ArtifactType

ALLOWED_ANIMATION_FORMATS: tuple[str, ...] = ("gif", "html5")
DEFAULT_ANIMATION_FORMAT = "html5"


def _normalize_token(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _first_non_empty(*values: Any) -> str:
    for value in values:
        normalized = _normalize_token(value)
        if normalized:
            return normalized
    return ""


@dataclass(frozen=True)
class ResolvedAnimationContract:
    animation_format: str
    render_mode: str
    artifact_type: str
    placement_supported: bool


class AnimationContractViolation(ValueError):
    def __init__(
        self,
        *,
        field_name: str,
        invalid_value: Any,
        detail: str,
        error_code: str = "INVALID_ANIMATION_FORMAT",
        allowed_formats: tuple[str, ...] | None = None,
    ):
        super().__init__(detail)
        self.field_name = field_name
        self.invalid_value = _normalize_token(invalid_value)
        self.detail = detail
        self.error_code = error_code
        self.allowed_formats = allowed_formats or ALLOWED_ANIMATION_FORMATS


def resolve_animation_contract(
    *,
    config: Mapping[str, Any] | None = None,
    payload: Mapping[str, Any] | None = None,
    default_format: str = DEFAULT_ANIMATION_FORMAT,
) -> ResolvedAnimationContract:
    cfg = config if isinstance(config, Mapping) else {}
    content = payload if isinstance(payload, Mapping) else {}

    requested_render_mode = _first_non_empty(
        cfg.get("render_mode"),
        content.get("render_mode"),
    )
    requested_format = _first_non_empty(
        cfg.get("animation_format"),
        content.get("format"),
        content.get("animation_format"),
    )

    if requested_format and requested_format not in ALLOWED_ANIMATION_FORMATS:
        raise AnimationContractViolation(
            field_name="animation_format",
            invalid_value=requested_format,
            detail=(
                "animation_format 仅支持 gif 或 html5；"
                f"收到 {requested_format!r}。"
            ),
        )

    if requested_render_mode and requested_render_mode not in ALLOWED_ANIMATION_FORMATS:
        raise AnimationContractViolation(
            field_name="render_mode",
            invalid_value=requested_render_mode,
            detail=(
                "render_mode 仅作为 animation_format 过渡别名，"
                f"仅支持 gif 或 html5；收到 {requested_render_mode!r}。"
            ),
        )

    if (
        requested_format
        and requested_render_mode
        and requested_format != requested_render_mode
    ):
        raise AnimationContractViolation(
            field_name="render_mode",
            invalid_value=requested_render_mode,
            detail=(
                "render_mode 与 animation_format 必须一致；"
                f"收到 animation_format={requested_format!r}, "
                f"render_mode={requested_render_mode!r}。"
            ),
            error_code="ANIMATION_FORMAT_MISMATCH",
        )

    resolved_format = requested_format or requested_render_mode or _normalize_token(
        default_format
    )
    if resolved_format not in ALLOWED_ANIMATION_FORMATS:
        raise AnimationContractViolation(
            field_name="animation_format",
            invalid_value=resolved_format,
            detail=(
                "animation_format 仅支持 gif 或 html5；"
                f"收到 {resolved_format!r}。"
            ),
        )

    artifact_type = (
        ArtifactType.GIF.value
        if resolved_format == "gif"
        else ArtifactType.HTML.value
    )
    placement_supported = resolved_format == "gif"

    return ResolvedAnimationContract(
        animation_format=resolved_format,
        render_mode=resolved_format,
        artifact_type=artifact_type,
        placement_supported=placement_supported,
    )
