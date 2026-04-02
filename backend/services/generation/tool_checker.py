"""
课件生成服务 - 工具检测模块
"""

import logging
import os
import shutil
import subprocess
import time
from dataclasses import dataclass

try:
    from ...utils.generation_exceptions import ToolNotFoundError
except ImportError:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from utils.generation_exceptions import ToolNotFoundError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _ToolCheckCacheEntry:
    checked_at: float
    ok: bool
    error_message: str | None = None


_TOOL_CHECK_CACHE: dict[str, _ToolCheckCacheEntry] = {}
_DEFAULT_CACHE_TTL_SECONDS = 300.0


def _cache_ttl_seconds() -> float:
    raw = os.getenv("TOOL_CHECK_CACHE_TTL_SECONDS", "").strip()
    if not raw:
        return _DEFAULT_CACHE_TTL_SECONDS
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 0.0
    except ValueError:
        return _DEFAULT_CACHE_TTL_SECONDS


def _cache_get(tool_name: str) -> _ToolCheckCacheEntry | None:
    ttl = _cache_ttl_seconds()
    if ttl <= 0:
        return None
    entry = _TOOL_CHECK_CACHE.get(tool_name)
    if entry is None:
        return None
    if (time.monotonic() - entry.checked_at) > ttl:
        _TOOL_CHECK_CACHE.pop(tool_name, None)
        return None
    return entry


def _cache_set(tool_name: str, *, ok: bool, error_message: str | None = None) -> None:
    ttl = _cache_ttl_seconds()
    if ttl <= 0:
        return
    _TOOL_CHECK_CACHE[tool_name] = _ToolCheckCacheEntry(
        checked_at=time.monotonic(),
        ok=ok,
        error_message=error_message,
    )


def clear_tool_check_cache() -> None:
    """Clear in-process tool check cache (mainly for tests)."""
    _TOOL_CHECK_CACHE.clear()


def resolve_marp_command() -> str:
    """Resolve the Marp executable name/path for the current platform."""
    candidates = ["marp.cmd", "marp"] if os.name == "nt" else ["marp"]
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise FileNotFoundError("marp executable not found")


def check_marp_installed() -> bool:
    """
    检查 Marp CLI 是否安装

    Returns:
        bool: 是否已安装

    Raises:
        ToolNotFoundError: 工具未安装
    """
    cached = _cache_get("marp")
    if cached is not None:
        if cached.ok:
            return True
        if cached.error_message:
            raise ToolNotFoundError("Marp CLI", cached.error_message)
        return False

    install_hint = "npm install -g @marp-team/marp-cli"
    try:
        marp_cmd = resolve_marp_command()
        result = subprocess.run(
            [marp_cmd, "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            logger.debug("Marp CLI detected: %s", result.stdout.strip())
            _cache_set("marp", ok=True)
            return True
        else:
            _cache_set("marp", ok=False, error_message=install_hint)
            raise ToolNotFoundError("Marp CLI", install_hint)
    except FileNotFoundError:
        _cache_set("marp", ok=False, error_message=install_hint)
        raise ToolNotFoundError("Marp CLI", install_hint)
    except subprocess.TimeoutExpired:
        logger.warning("Marp CLI version check timeout")
        _cache_set("marp", ok=False)
        return False


def check_pandoc_installed() -> bool:
    """
    检查 Pandoc 是否安装

    Returns:
        bool: 是否已安装

    Raises:
        ToolNotFoundError: 工具未安装
    """
    cached = _cache_get("pandoc")
    if cached is not None:
        if cached.ok:
            return True
        if cached.error_message:
            raise ToolNotFoundError("Pandoc", cached.error_message)
        return False

    install_hint = "brew install pandoc (macOS) or apt-get install pandoc (Linux)"
    try:
        result = subprocess.run(
            ["pandoc", "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            version_line = result.stdout.split("\n")[0]
            logger.debug("Pandoc detected: %s", version_line)
            _cache_set("pandoc", ok=True)
            return True
        else:
            _cache_set("pandoc", ok=False, error_message=install_hint)
            raise ToolNotFoundError("Pandoc", install_hint)
    except FileNotFoundError:
        _cache_set("pandoc", ok=False, error_message=install_hint)
        raise ToolNotFoundError("Pandoc", install_hint)
    except subprocess.TimeoutExpired:
        logger.warning("Pandoc version check timeout")
        _cache_set("pandoc", ok=False)
        return False


def check_tools_installed():
    """检测必要的工具是否已安装"""
    try:
        check_marp_installed()
        check_pandoc_installed()
    except ToolNotFoundError as e:
        logger.error(f"Tool check failed: {e.message}")
        # 不抛出异常，让服务可以启动
