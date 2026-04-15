"""Diego runtime sync constants."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)

_SCHEMA_VERSION = 1

_DIEGO_STATUS_OUTLINE_DRAFTING = "OUTLINE_DRAFTING"

_DIEGO_STATUS_AWAITING_OUTLINE_CONFIRM = "AWAITING_OUTLINE_CONFIRM"

_DIEGO_STATUS_SLIDES_GENERATING = "SLIDES_GENERATING"

_DIEGO_STATUS_COMPILING = "COMPILING"

_DIEGO_STATUS_SUCCEEDED = "SUCCEEDED"

_DIEGO_STATUS_FAILED = "FAILED"

_DIEGO_EVENT_SLIDE_GENERATED = "slide.generated"

_DIEGO_STREAM_CHANNEL_PREAMBLE = "diego.preamble"

_DIEGO_STREAM_CHANNEL_OUTLINE_TOKEN = "diego.outline.token"

_DIEGO_EVENT_MESSAGE_MAP: dict[str, str] = {
    "requirements.analyzing.started": "正在分析需求与素材上下文",
    "requirements.analyzing.completed": "需求分析完成",
    "requirements.analyzed": "需求结构已确定",
    "outline.repair.started": "正在修复大纲结构",
    "outline.repair.completed": "大纲修复完成",
    "outline.repair.failed": "大纲修复失败，正在重试",
    "research.completed": "研究信息已整理",
    "plan.completed": "结构规划完成",
    "outline.completed": "大纲生成完成",
}
