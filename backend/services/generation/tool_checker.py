"""
课件生成服务 - 工具检测模块
"""

import logging
import subprocess

try:
    from ...utils.generation_exceptions import ToolNotFoundError
except ImportError:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from utils.generation_exceptions import ToolNotFoundError

logger = logging.getLogger(__name__)


def check_marp_installed() -> bool:
    """
    检查 Marp CLI 是否安装

    Returns:
        bool: 是否已安装

    Raises:
        ToolNotFoundError: 工具未安装
    """
    try:
        result = subprocess.run(
            ["marp", "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            logger.info(f"Marp CLI detected: {result.stdout.strip()}")
            return True
        else:
            raise ToolNotFoundError("Marp CLI", "npm install -g @marp-team/marp-cli")
    except FileNotFoundError:
        raise ToolNotFoundError("Marp CLI", "npm install -g @marp-team/marp-cli")
    except subprocess.TimeoutExpired:
        logger.warning("Marp CLI version check timeout")
        return False


def check_pandoc_installed() -> bool:
    """
    检查 Pandoc 是否安装

    Returns:
        bool: 是否已安装

    Raises:
        ToolNotFoundError: 工具未安装
    """
    try:
        result = subprocess.run(
            ["pandoc", "--version"], capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            version_line = result.stdout.split("\n")[0]
            logger.info(f"Pandoc detected: {version_line}")
            return True
        else:
            raise ToolNotFoundError(
                "Pandoc",
                "brew install pandoc (macOS) or apt-get install pandoc (Linux)",
            )
    except FileNotFoundError:
        raise ToolNotFoundError(
            "Pandoc", "brew install pandoc (macOS) or apt-get install pandoc (Linux)"
        )
    except subprocess.TimeoutExpired:
        logger.warning("Pandoc version check timeout")
        return False


def check_tools_installed():
    """检测必要的工具是否已安装"""
    try:
        check_marp_installed()
        check_pandoc_installed()
    except ToolNotFoundError as e:
        logger.error(f"Tool check failed: {e.message}")
        # 不抛出异常，让服务可以启动
