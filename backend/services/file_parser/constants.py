"""Shared constants for file parsing workflows."""

_PLAIN_TEXT_EXTENSIONS = {".txt", ".md", ".csv"}

AUTO_PARSER_MODE = "auto"
SUPPORTED_PARSER_MODES = {
    "local",
    "mineru",
    "mineru_api",
    "mineru_cloud",
    AUTO_PARSER_MODE,
}

_DEGRADATION_MESSAGES = {
    "mineru_cloud_to_local": "MinerU 云解析暂不可用，已切换到本地解析，结果可能有格式差异。",
    "mineru_api_to_local": "MinerU API 暂不可用，已切换到本地解析，结果可能有格式差异。",
    "mineru_to_local": "高级解析暂不可用，已切换到基础解析，版面结构与公式识别可能不完整。",
}

_FALLBACK_CHAIN = {
    "mineru_cloud": ["local"],
    "mineru_api": ["local"],
    "mineru": ["local"],
    "local": [],
}
