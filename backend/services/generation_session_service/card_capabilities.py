from __future__ import annotations

from schemas.studio_cards import (
    StudioCardCapability,
    StudioCardContextMode,
    StudioCardReadiness,
)

_CARD_CAPABILITIES: tuple[StudioCardCapability, ...] = (
    StudioCardCapability(
        id="word_document",
        title="Word 教案与文档",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.HYBRID,
        primary_capabilities=["word", "handout"],
        related_capabilities=["outline", "summary", "quiz"],
        artifact_types=["docx", "summary", "exercise"],
        notes="文档生成与讲义承载已具备，卡片级配置协议仍待补齐。",
    ),
    StudioCardCapability(
        id="interactive_quick_quiz",
        title="随堂小测",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        primary_capabilities=["quiz"],
        related_capabilities=["summary", "outline"],
        artifact_types=["exercise"],
        notes="题目 artifact 已具备，单题沉浸式交互与局部重绘协议仍待补齐。",
    ),
    StudioCardCapability(
        id="interactive_games",
        title="互动游戏",
        readiness=StudioCardReadiness.PROTOCOL_PENDING,
        context_mode=StudioCardContextMode.ARTIFACT,
        primary_capabilities=["game", "html"],
        related_capabilities=["summary", "mindmap"],
        artifact_types=["html"],
        notes="当前可承载 HTML artifact，但专用 game 生成协议尚未正式落地。",
    ),
    StudioCardCapability(
        id="knowledge_mindmap",
        title="思维导图",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        primary_capabilities=["mindmap"],
        related_capabilities=["summary", "outline"],
        artifact_types=["mindmap"],
        notes="导图 artifact 已具备，节点级上下文微调协议仍待补齐。",
    ),
    StudioCardCapability(
        id="demonstration_animations",
        title="演示动画",
        readiness=StudioCardReadiness.FOUNDATION_READY,
        context_mode=StudioCardContextMode.ARTIFACT,
        primary_capabilities=["animation"],
        related_capabilities=["summary", "outline"],
        artifact_types=["gif", "mp4", "html"],
        notes="动画 storyboard 与媒体占位输出已具备，参数化热更新协议仍待补齐。",
    ),
    StudioCardCapability(
        id="speaker_notes",
        title="说课助手",
        readiness=StudioCardReadiness.PROTOCOL_PENDING,
        context_mode=StudioCardContextMode.HYBRID,
        primary_capabilities=["ppt", "speaker_notes"],
        related_capabilities=["word", "summary"],
        artifact_types=["pptx", "docx", "summary"],
        notes="依赖 PPT/session/artifact 组合语义，专用提词器协议尚未正式建模。",
    ),
    StudioCardCapability(
        id="classroom_qa_simulator",
        title="学情预演",
        readiness=StudioCardReadiness.PROTOCOL_PENDING,
        context_mode=StudioCardContextMode.SESSION,
        primary_capabilities=["qa_simulator", "chat"],
        related_capabilities=["rag", "summary", "outline"],
        artifact_types=[],
        notes="依赖 chat/session/rag 组合能力，虚拟学生协议与评估回路尚未正式建模。",
    ),
)


def get_studio_card_capabilities() -> list[dict]:
    return [card.model_dump(mode="json") for card in _CARD_CAPABILITIES]
