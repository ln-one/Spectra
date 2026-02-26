"""
Text Chunking - 文本分块工具

递归字符分割，支持中英文混合文本。
"""

import re

# 分块参数
DEFAULT_CHUNK_SIZE = 500  # tokens
DEFAULT_CHUNK_OVERLAP = 50  # tokens
# 中文 1 字 ≈ 1.5 token，用字符数估算
CHARS_PER_TOKEN = 0.67  # 1 token ≈ 0.67 个中文字符（反过来 1 字 ≈ 1.5 token）

# 分割符优先级
SEPARATORS = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"]


def _estimate_tokens(text: str) -> int:
    """估算文本 token 数（中英文混合）"""
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.5 + other_chars * 0.25)


def split_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    """
    递归字符分割

    分割符优先级：\\n\\n > \\n > 。！？.!?
    尽量在标点处断开，保持语义完整性。

    Args:
        text: 待分割文本
        chunk_size: 目标分块大小（token 数）
        chunk_overlap: 相邻块重叠大小（token 数）

    Returns:
        分块文本列表
    """
    if not text or not text.strip():
        return []

    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be less than chunk_size")

    max_chars = int(chunk_size * CHARS_PER_TOKEN)
    overlap_chars = int(chunk_overlap * CHARS_PER_TOKEN)

    # 如果文本足够短，直接返回
    if _estimate_tokens(text) <= chunk_size:
        return [text.strip()]

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + max_chars, len(text))

        # 如果不是最后一段，尝试在分割符处断开
        if end < len(text):
            best_split = -1
            for sep in SEPARATORS:
                # 在 [start + max_chars//2, end] 范围内找最后一个分割符
                search_start = start + max_chars // 2
                pos = text.rfind(sep, search_start, end)
                if pos > best_split:
                    best_split = pos + len(sep)

            if best_split > start:
                end = best_split

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # 下一段起始位置（减去重叠）
        start = end - overlap_chars if end < len(text) else end

    return chunks
