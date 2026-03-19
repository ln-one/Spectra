"""Shared constants for file parsing workflows."""

_PLAIN_TEXT_EXTENSIONS = {".txt", ".md", ".csv"}

_DEGRADATION_MESSAGES = {
    "mineru_to_llamaparse": "MinerU 解析暂不可用，已切换到 LlamaParse 云端解析。",
    "mineru_to_local": "高级解析暂不可用，已切换基础解析，版面结构与公式识别可能不完整。",
    "llamaparse_to_local": "云端解析暂不可用，已切换本地解析，结果可能有格式差异。",
}

_FALLBACK_CHAIN = {
    "mineru": ["llamaparse", "local"],
    "llamaparse": ["mineru", "local"],
    "local": [],
}
