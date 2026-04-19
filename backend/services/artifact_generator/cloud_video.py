from __future__ import annotations

import asyncio
import base64
import logging
import os
from pathlib import Path
from typing import Any

import httpx

from services.artifact_generator.cloud_video_first_frame import (
    render_animation_first_frame,
)

logger = logging.getLogger(__name__)

_DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
_CREATE_ENDPOINT = "/services/aigc/video-generation/video-synthesis"
_TASK_ENDPOINT_TEMPLATE = "/tasks/{task_id}"
_FINAL_STATES = {"SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"}


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _resolve_api_key() -> str:
    api_key = str(
        os.getenv("ALIYUN_VIDEO_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or ""
    ).strip()
    if not api_key:
        raise RuntimeError("Aliyun video API key is not configured")
    return api_key


def _resolve_base_url() -> str:
    return (
        str(os.getenv("ALIYUN_VIDEO_BASE_URL") or _DEFAULT_DASHSCOPE_BASE_URL)
        .strip()
        .rstrip("/")
    )


def _resolve_model() -> str:
    return str(os.getenv("ALIYUN_VIDEO_MODEL") or "wan2.7-i2v").strip()


def _resolve_resolution() -> str:
    return str(os.getenv("ALIYUN_VIDEO_RESOLUTION") or "720P").strip()


def _resolve_timeout_seconds() -> float:
    raw = str(os.getenv("ALIYUN_VIDEO_TIMEOUT_SECONDS") or "420").strip()
    try:
        return max(30.0, float(raw))
    except ValueError:
        return 420.0


def _resolve_poll_interval_seconds() -> float:
    raw = str(os.getenv("ALIYUN_VIDEO_POLL_INTERVAL_SECONDS") or "15").strip()
    try:
        return max(2.0, float(raw))
    except ValueError:
        return 15.0


def should_use_aliyun_wan_video(content: dict[str, Any] | None) -> bool:
    if not isinstance(content, dict):
        return False
    render_mode = str(content.get("render_mode") or "").strip().lower()
    provider = str(content.get("cloud_video_provider") or "").strip().lower()
    return render_mode == "cloud_video_wan" or provider == "aliyun_wan"


def _clip_text(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").strip().split())
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def _build_shot_prompt(
    scene: dict[str, Any],
    *,
    index: int,
    start_second: int,
    end_second: int,
) -> str:
    title = _clip_text(scene.get("title") or f"镜头 {index}", 28)
    description = _clip_text(
        scene.get("description") or scene.get("emphasis") or "", 90
    )
    emphasis = _clip_text(scene.get("emphasis") or "", 40)
    shot_type = str(scene.get("shot_type") or "").strip().lower()
    shot_label = {
        "intro": "建立镜头",
        "focus": "主体教学镜头",
        "summary": "收束镜头",
    }.get(shot_type, "教学镜头")
    fragments = [
        f"第{index}个镜头[{start_second}-{end_second}秒] {shot_label}",
        f"主题：{title}",
    ]
    if description:
        fragments.append(description)
    if emphasis:
        fragments.append(f"强调：{emphasis}")
    return "，".join(fragments)


def build_aliyun_wan_prompt(content: dict[str, Any]) -> str:
    title = _clip_text(content.get("title") or content.get("topic") or "教学动画", 60)
    summary = _clip_text(content.get("summary") or content.get("focus") or "", 120)
    focus = _clip_text(content.get("focus") or "", 80)
    family = str(content.get("family_hint") or content.get("animation_family") or "").strip()
    scenes = [
        dict(scene)
        for scene in (content.get("scenes") or [])
        if isinstance(scene, dict)
    ]
    duration_seconds = max(2, min(int(content.get("duration_seconds") or 8), 15))
    scene_count = max(1, len(scenes))
    seconds_per_scene = max(1, duration_seconds // scene_count)
    prompt_parts = [
        "生成克制、清晰、适合课堂展示的教学视频。",
        f"主题：{title}。",
        "整体要求：主体明确、信息图形化、镜头稳定、避免无关人物表演、避免强影视特效、避免装饰性炫技。",
        "构图要求：首帧主体清晰可辨，后续镜头围绕同一解释对象展开。",
    ]
    if family:
        prompt_parts.append(f"题材类型：{family}。")
    if summary:
        prompt_parts.append(f"教学说明：{summary}。")
    if focus:
        prompt_parts.append(f"表现重点：{focus}。")
    if scenes:
        shot_prompts: list[str] = []
        current_start = 0
        for index, scene in enumerate(scenes, start=1):
            current_end = (
                duration_seconds
                if index == scene_count
                else min(duration_seconds, current_start + seconds_per_scene)
            )
            shot_prompts.append(
                _build_shot_prompt(
                    scene,
                    index=index,
                    start_second=current_start,
                    end_second=max(current_start + 1, current_end),
                )
            )
            current_start = current_end
        prompt_parts.append("分镜脚本：" + " ".join(shot_prompts))
    else:
        prompt_parts.append("分镜脚本：以3到5个镜头完成引入、关键变化、结论收束。")
    prompt_parts.append(
        "禁止事项：不要随机生成与主题无关主体，不要过多漂浮字幕，不要做成海报式静止画面。"
    )
    return " ".join(prompt_parts)


def build_aliyun_wan_first_frame_prompt(content: dict[str, Any]) -> str:
    title = _clip_text(content.get("title") or content.get("topic") or "教学动画", 60)
    focus = _clip_text(content.get("focus") or content.get("summary") or "", 100)
    family = str(content.get("family_hint") or content.get("animation_family") or "").strip()
    return " ".join(
        part
        for part in [
            f"首帧构图围绕{title}展开。",
            f"题材：{family}。" if family else "",
            f"首帧强调：{focus}。" if focus else "",
            "画面保持中性灰教学视觉，主体清晰，适合后续图生视频延展。",
        ]
        if part
    )


def _encode_file_data_uri(filepath: str) -> str:
    path = Path(filepath)
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _resolve_first_frame_asset(content: dict[str, Any], storage_path: str) -> str:
    existing = str(content.get("first_frame_asset_url") or "").strip()
    if existing:
        if existing.startswith("file://"):
            return existing[len("file://") :]
        return existing
    frame_path = str(Path(storage_path).with_suffix(".first-frame.png"))
    actual_path = render_animation_first_frame(content, frame_path)
    content["first_frame_asset_url"] = f"file://{actual_path}"
    return actual_path


async def _create_task(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    payload: dict[str, Any],
) -> str:
    response = await client.post(
        _CREATE_ENDPOINT,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        json=payload,
    )
    response.raise_for_status()
    body = response.json()
    task_id = str(((body.get("output") or {}).get("task_id")) or "").strip()
    if not task_id:
        raise RuntimeError(f"Aliyun video task id missing: {body}")
    return task_id


async def _wait_for_task(
    *,
    client: httpx.AsyncClient,
    api_key: str,
    task_id: str,
) -> dict[str, Any]:
    deadline = asyncio.get_running_loop().time() + _resolve_timeout_seconds()
    poll_interval_seconds = _resolve_poll_interval_seconds()
    last_payload: dict[str, Any] = {}
    while True:
        response = await client.get(
            _TASK_ENDPOINT_TEMPLATE.format(task_id=task_id),
            headers={"Authorization": f"Bearer {api_key}"},
        )
        response.raise_for_status()
        last_payload = response.json()
        task_status = str(
            ((last_payload.get("output") or {}).get("task_status")) or ""
        ).strip()
        if task_status in _FINAL_STATES:
            return last_payload
        if asyncio.get_running_loop().time() >= deadline:
            raise TimeoutError(f"Aliyun video task timeout: {task_id}")
        await asyncio.sleep(poll_interval_seconds)


async def _download_video(
    *,
    client: httpx.AsyncClient,
    video_url: str,
    storage_path: str,
) -> str:
    response = await client.get(video_url, timeout=_resolve_timeout_seconds())
    response.raise_for_status()
    target = Path(storage_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)
    return str(target)


async def render_aliyun_wan_video(content: dict[str, Any], storage_path: str) -> str:
    if not should_use_aliyun_wan_video(content):
        raise RuntimeError("Aliyun Wan video rendering is not enabled for this content")
    if not _env_flag("ALIYUN_VIDEO_ENABLED", True):
        raise RuntimeError("Aliyun Wan video rendering is disabled by configuration")

    api_key = _resolve_api_key()
    base_url = _resolve_base_url()
    model = str(content.get("cloud_video_model") or _resolve_model()).strip()
    prompt = str(content.get("video_prompt") or content.get("cloud_video_prompt") or "").strip()
    if not prompt:
        prompt = build_aliyun_wan_prompt(content)
    content["video_prompt"] = prompt
    content["cloud_video_prompt"] = prompt
    content["cloud_video_provider"] = "aliyun_wan"
    content["cloud_video_model"] = model
    content["cloud_video_status"] = "submitting"
    content["first_frame_prompt"] = str(content.get("first_frame_prompt") or "").strip() or build_aliyun_wan_first_frame_prompt(content)

    duration_seconds = max(2, min(int(content.get("duration_seconds") or 8), 15))
    first_frame_path = _resolve_first_frame_asset(content, storage_path)
    data_uri = _encode_file_data_uri(first_frame_path)
    payload = {
        "model": model,
        "input": {
            "prompt": prompt,
            "media": [
                {
                    "type": "first_frame",
                    "url": data_uri,
                }
            ],
        },
        "parameters": {
            "resolution": str(
                content.get("cloud_video_resolution") or _resolve_resolution()
            ).strip(),
            "duration": duration_seconds,
            "prompt_extend": _env_flag("ALIYUN_VIDEO_PROMPT_EXTEND", True),
            "watermark": bool(
                content.get("cloud_video_watermark")
                if content.get("cloud_video_watermark") is not None
                else _env_flag("ALIYUN_VIDEO_WATERMARK", False)
            ),
        },
    }
    if content.get("negative_prompt"):
        payload["input"]["negative_prompt"] = str(content["negative_prompt"]).strip()
    if content.get("cloud_video_seed") not in (None, ""):
        payload["parameters"]["seed"] = int(content["cloud_video_seed"])

    logger.info(
        "Submitting Aliyun Wan i2v task model=%s duration=%s storage=%s",
        model,
        duration_seconds,
        storage_path,
    )
    async with httpx.AsyncClient(
        base_url=base_url, timeout=_resolve_timeout_seconds()
    ) as client:
        try:
            task_id = await _create_task(client=client, api_key=api_key, payload=payload)
            content["cloud_video_task_id"] = task_id
            content["cloud_video_status"] = "running"
            result = await _wait_for_task(client=client, api_key=api_key, task_id=task_id)
            output = result.get("output") or {}
            task_status = str(output.get("task_status") or "").strip()
            if task_status != "SUCCEEDED":
                content["cloud_video_status"] = "failed"
                content["cloud_video_error"] = str(
                    output.get("message")
                    or output.get("code")
                    or f"task_status={task_status}"
                ).strip()
                raise RuntimeError(
                    "Aliyun Wan video generation failed: "
                    f"task_id={task_id} status={task_status} "
                    f"code={output.get('code')} message={output.get('message')}"
                )
            video_url = str(output.get("video_url") or "").strip()
            if not video_url:
                content["cloud_video_status"] = "failed"
                content["cloud_video_error"] = f"task_id={task_id} missing video_url"
                raise RuntimeError(f"Aliyun Wan video url missing: task_id={task_id}")
            content["cloud_video_result_url"] = video_url
            downloaded_path = await _download_video(
                client=client,
                video_url=video_url,
                storage_path=storage_path,
            )
            content["cloud_video_status"] = "succeeded"
        except Exception as exc:
            if not content.get("cloud_video_error"):
                content["cloud_video_error"] = str(exc)
            content["cloud_video_status"] = "failed"
            raise
    logger.info(
        "Aliyun Wan i2v video generated task_id=%s path=%s",
        content.get("cloud_video_task_id"),
        downloaded_path,
    )
    return downloaded_path
