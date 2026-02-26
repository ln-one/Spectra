"""
文件名安全处理工具

防止文件名中的特殊字符导致 HTTP Header 解析失败
"""

import re
from urllib.parse import quote


def sanitize_filename(filename: str, max_length: int = 100) -> str:
    """
    清洗文件名，移除或替换不安全的字符
    
    Args:
        filename: 原始文件名
        max_length: 最大长度限制
        
    Returns:
        str: 安全的文件名
    """
    if not filename:
        return "file"
    
    # 移除或替换危险字符
    # 移除控制字符（换行、制表符等）
    filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
    
    # 替换路径分隔符和其他危险字符
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    
    # 移除前后空格和点号（防止隐藏文件或路径问题）
    filename = filename.strip(' .')
    
    # 限制长度
    if len(filename) > max_length:
        filename = filename[:max_length]
    
    # 如果清洗后为空或只剩下替换字符，使用默认名称
    if not filename or re.match(r'^_+$', filename):
        return "file"
    
    return filename


def safe_filename_for_header(filename: str, max_length: int = 100) -> str:
    """
    为 HTTP Content-Disposition Header 生成安全的文件名
    
    对于包含非 ASCII 字符的文件名，使用 RFC 5987 编码
    
    Args:
        filename: 原始文件名
        max_length: 最大长度限制
        
    Returns:
        str: 适合放入 HTTP Header 的安全文件名
    """
    # 先进行基础清洗
    clean_name = sanitize_filename(filename, max_length)
    
    # 如果清洗后为空或只是默认值，直接返回
    if not clean_name or clean_name == "file":
        return "file"
    
    # 检查是否包含非 ASCII 字符
    try:
        clean_name.encode('ascii')
        # 纯 ASCII，直接返回
        return clean_name
    except UnicodeEncodeError:
        # 包含非 ASCII 字符，进行 URL 编码
        # 使用 RFC 5987 格式: filename*=UTF-8''encoded_filename
        encoded = quote(clean_name.encode('utf-8'))
        return f"UTF-8''{encoded}"