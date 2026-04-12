"""Manim Renderer Service

A lightweight FastAPI micro-service that:
  1. Accepts a POST /render request with Manim Python code + scene name
  2. Writes the code to a temp file
  3. Executes `manim` CLI in a subprocess
  4. Returns the rendered GIF/MP4 as a binary response

Security: code execution is intentionally sandboxed to a temp directory.
The service should only be reachable from within the Docker Compose network.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Manim Renderer", version="0.1.0")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_MANIM_TIMEOUT_SECONDS = int(os.getenv("MANIM_TIMEOUT_SECONDS", "120"))
_MAX_CODE_LENGTH = int(os.getenv("MANIM_MAX_CODE_LENGTH", "32000"))
_WORK_ROOT = Path(os.getenv("MANIM_WORK_DIR", "/tmp/manim-renderer"))
_WORK_ROOT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class RenderRequest(BaseModel):
    code: str = Field(..., description="完整的 Manim Python 代码")
    scene_name: str = Field(..., description="要渲染的 Scene 类名")
    output_format: Literal["gif", "mp4"] = Field("gif", description="输出格式")
    quality: Literal["l", "m", "h", "k"] = Field(
        "l", description="渲染质量：l=480p, m=720p, h=1080p, k=4K"
    )
    fps: int = Field(15, ge=6, le=60, description="帧率")


# ---------------------------------------------------------------------------
# Security: basic code sanity checks
# ---------------------------------------------------------------------------
_FORBIDDEN_PATTERNS = [
    r"\bos\.system\b",
    r"\bsubprocess\b",
    r"\bopen\s*\(",           # 禁止任意文件写入（manim 本身可以，但代码里不行）
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\b__import__\b",
    r"\bimportlib\b",
    r"\bsocket\b",
    r"\burllib\b",
    r"\brequests\b",
    r"\bhttpx\b",
    r"\baiohttp\b",
    r"\bshutil\b",
    r"\bpathlib\.Path\b",
]
_FORBIDDEN_RE = re.compile("|".join(_FORBIDDEN_PATTERNS))


def _check_code_safety(code: str) -> None:
    """Raise ValueError if code contains forbidden constructs."""
    if len(code) > _MAX_CODE_LENGTH:
        raise ValueError(f"Code length {len(code)} exceeds limit {_MAX_CODE_LENGTH}")
    if _FORBIDDEN_RE.search(code):
        raise ValueError("Code contains forbidden constructs")
    # Must import from manim
    if "from manim import" not in code and "import manim" not in code:
        raise ValueError("Code must import from manim")


# ---------------------------------------------------------------------------
# Render logic
# ---------------------------------------------------------------------------

def _resolve_output_file(work_dir: Path, scene_name: str, output_format: str, quality: str) -> Path:
    """Find the file manim produced under media/videos/..."""
    # manim outputs to: media/videos/<scene_file_stem>/<quality_dir>/<SceneName>[_suffix].<ext>
    # e.g. GeneratedScene_ManimCE_v0.18.1.gif
    candidates = [
        p
        for p in work_dir.rglob(f"*.{output_format}")
        if p.stem.startswith(scene_name)
    ]
    if candidates:
        return candidates[0]
    # Also check partial quality matches
    for p in work_dir.rglob(f"{scene_name}.*"):
        if p.suffix.lstrip(".") in ("gif", "mp4", "webm"):
            return p
    # Final fallback: any media file with scene_name prefix in stem.
    for p in work_dir.rglob("*.*"):
        if p.suffix.lstrip(".") in ("gif", "mp4", "webm") and p.stem.startswith(
            scene_name
        ):
            return p
    raise FileNotFoundError(
        f"Manim output not found for scene={scene_name} format={output_format} "
        f"under {work_dir}"
    )


async def _run_manim(
    code: str,
    scene_name: str,
    output_format: str,
    quality: str,
    fps: int,
) -> tuple[Path, Path]:
    job_id = uuid.uuid4().hex
    work_dir = _WORK_ROOT / job_id
    work_dir.mkdir(parents=True)

    scene_file = work_dir / "scene.py"
    scene_file.write_text(code, encoding="utf-8")

    # Build manim CLI command
    # -q{quality}: quality preset
    # --format: gif or mp4
    # --fps: frame rate
    # --media_dir: output dir
    # --disable_caching: avoid stale cache issues in ephemeral containers
    cmd = [
        "manim",
        f"-q{quality}",
        f"--format={output_format}",
        f"--fps={fps}",
        f"--media_dir={work_dir / 'media'}",
        "--disable_caching",
        "--no_latex_cleanup",
        str(scene_file),
        scene_name,
    ]

    logger.info("manim render job=%s cmd=%s", job_id, " ".join(cmd))

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(work_dir),
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=_MANIM_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        proc.kill()
        shutil.rmtree(work_dir, ignore_errors=True)
        raise RuntimeError(
            f"Manim render timed out after {_MANIM_TIMEOUT_SECONDS}s "
            f"for scene={scene_name}"
        )

    stdout_text = stdout.decode("utf-8", errors="replace")
    stderr_text = stderr.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        logger.error(
            "manim render failed job=%s returncode=%d\nstdout:\n%s\nstderr:\n%s",
            job_id, proc.returncode, stdout_text[-2000:], stderr_text[-2000:]
        )
        shutil.rmtree(work_dir, ignore_errors=True)
        raise RuntimeError(
            f"Manim render failed (code {proc.returncode}): "
            f"{stderr_text[-800:]}"
        )

    logger.info(
        "manim render succeeded job=%s returncode=0\nstdout:\n%s\nstderr:\n%s",
        job_id, stdout_text[-1500:], stderr_text[-1500:]
    )

    try:
        output_file = _resolve_output_file(work_dir, scene_name, output_format, quality)
    except FileNotFoundError as exc:
        logger.error(
            "Output file not found job=%s, listing work_dir contents:\n%s",
            job_id,
            "\n".join(str(p) for p in work_dir.rglob("*") if p.is_file())
        )
        shutil.rmtree(work_dir, ignore_errors=True)
        raise RuntimeError(str(exc)) from exc

    logger.info(
        "manim render done job=%s output=%s size=%d",
        job_id, output_file, output_file.stat().st_size
    )
    return work_dir, output_file


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health/ready")
async def health_ready():
    return {"status": "ok"}


@app.post("/render")
async def render(req: RenderRequest):
    # Safety check
    try:
        _check_code_safety(req.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Render
    try:
        work_dir, output_file = await _run_manim(
            code=req.code,
            scene_name=req.scene_name,
            output_format=req.output_format,
            quality=req.quality,
            fps=req.fps,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        payload = output_file.read_bytes()
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
    media_type = "image/gif" if req.output_format == "gif" else "video/mp4"
    return Response(content=payload, media_type=media_type)


@app.post("/render/with-retry")
async def render_with_retry(req: RenderRequest):
    """Same as /render but accepts an error field for LLM fix loop (handled client-side)."""
    return await render(req)
