"""
File utilities for generation service

Provides safe file path management and validation.
"""

import os
import re
from pathlib import Path
from typing import Optional


def safe_path_join(base_dir: Path, filename: str) -> Path:
    """
    安全的路径拼接，防止路径遍历攻击
    
    Args:
        base_dir: 基础目录
        filename: 文件名
    
    Returns:
        Path: 安全的完整路径
    
    Raises:
        ValueError: 如果检测到路径遍历攻击
    
    Examples:
        >>> base = Path("/app/generated")
        >>> safe_path_join(base, "task-123.pptx")
        Path('/app/generated/task-123.pptx')
        
        >>> safe_path_join(base, "../etc/passwd")  # 抛出 ValueError
    """
    # 先检查是否包含路径遍历尝试
    if '..' in filename or '/' in filename or '\\' in filename:
        raise ValueError(f'Invalid file path: {filename} (path traversal detected)')
    
    # 移除其他潜在危险字符
    safe_filename = re.sub(r'[<>:"|?*]', '', filename)
    
    # 确保文件名不为空
    if not safe_filename or safe_filename.isspace():
        raise ValueError('Invalid filename: empty or whitespace only')
    
    # 构建完整路径
    full_path = (base_dir / safe_filename).resolve()
    
    # 双重检查：确保路径在 base_dir 内
    if not str(full_path).startswith(str(base_dir.resolve())):
        raise ValueError(f'Invalid file path: {filename} (path traversal detected)')
    
    return full_path


def ensure_directory_exists(directory: Path) -> None:
    """
    确保目录存在，如果不存在则创建
    
    Args:
        directory: 目录路径
    
    Raises:
        OSError: 如果无法创建目录
    """
    directory.mkdir(parents=True, exist_ok=True)


def get_generation_output_path(
    output_dir: Path,
    task_id: str,
    file_type: str,
) -> Path:
    """
    获取生成文件的输出路径
    
    Args:
        output_dir: 输出目录
        task_id: 任务 ID
        file_type: 文件类型（pptx/docx）
    
    Returns:
        Path: 输出文件路径
    
    Examples:
        >>> get_generation_output_path(Path("generated"), "task-123", "pptx")
        Path('generated/task-123.pptx')
    """
    # 验证文件类型
    valid_types = ['pptx', 'docx', 'pdf', 'md']
    if file_type not in valid_types:
        raise ValueError(f'Invalid file type: {file_type}. Must be one of {valid_types}')
    
    # 清理 task_id
    safe_task_id = re.sub(r'[^a-zA-Z0-9_-]', '', task_id)
    if not safe_task_id:
        raise ValueError('Invalid task_id: contains no valid characters')
    
    # 构建文件名
    filename = f"{safe_task_id}.{file_type}"
    
    # 使用 safe_path_join 确保安全
    return safe_path_join(output_dir, filename)


def get_temp_file_path(
    temp_dir: Path,
    task_id: str,
    file_type: str,
) -> Path:
    """
    获取临时文件路径
    
    Args:
        temp_dir: 临时目录
        task_id: 任务 ID
        file_type: 文件类型（md）
    
    Returns:
        Path: 临时文件路径
    """
    # 清理 task_id
    safe_task_id = re.sub(r'[^a-zA-Z0-9_-]', '', task_id)
    if not safe_task_id:
        raise ValueError('Invalid task_id: contains no valid characters')
    
    # 构建文件名
    filename = f"{safe_task_id}_temp.{file_type}"
    
    # 使用 safe_path_join 确保安全
    return safe_path_join(temp_dir, filename)


def validate_file_exists(filepath: Path, min_size: int = 0) -> bool:
    """
    验证文件存在且大小符合要求
    
    Args:
        filepath: 文件路径
        min_size: 最小文件大小（字节），默认为 0
    
    Returns:
        bool: 文件是否有效
    """
    if not filepath.exists():
        return False
    
    if not filepath.is_file():
        return False
    
    if filepath.stat().st_size < min_size:
        return False
    
    return True


def get_file_size(filepath: Path) -> int:
    """
    获取文件大小
    
    Args:
        filepath: 文件路径
    
    Returns:
        int: 文件大小（字节）
    
    Raises:
        FileNotFoundError: 如果文件不存在
    """
    if not filepath.exists():
        raise FileNotFoundError(f'File not found: {filepath}')
    
    return filepath.stat().st_size


def cleanup_file(filepath: Path, ignore_errors: bool = True) -> bool:
    """
    清理文件
    
    Args:
        filepath: 文件路径
        ignore_errors: 是否忽略错误
    
    Returns:
        bool: 是否成功删除
    """
    try:
        if filepath.exists() and filepath.is_file():
            filepath.unlink()
            return True
        return False
    except Exception as e:
        if not ignore_errors:
            raise
        return False
