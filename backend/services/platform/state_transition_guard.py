"""
StateTransitionGuard - 会话状态转换校验器

按 OpenAPI 契约强制校验会话命令的状态可达性。
所有经过 /generate/sessions/{id}/commands 的写操作必须经过本模块校验。

契约参考：docs/openapi.yaml GenerationState / GenerationCommandType
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)

# ============================================================
# State & Command 枚举（与 OpenAPI GenerationState / GenerationCommandType 对齐）
# ============================================================


class GenerationState(str, Enum):
    IDLE = "IDLE"
    CONFIGURING = "CONFIGURING"
    ANALYZING = "ANALYZING"
    DRAFTING_OUTLINE = "DRAFTING_OUTLINE"
    AWAITING_OUTLINE_CONFIRM = "AWAITING_OUTLINE_CONFIRM"
    GENERATING_CONTENT = "GENERATING_CONTENT"
    RENDERING = "RENDERING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class GenerationCommandType(str, Enum):
    UPDATE_OUTLINE = "UPDATE_OUTLINE"
    REDRAFT_OUTLINE = "REDRAFT_OUTLINE"
    CONFIRM_OUTLINE = "CONFIRM_OUTLINE"
    REGENERATE_SLIDE = "REGENERATE_SLIDE"
    RESUME_SESSION = "RESUME_SESSION"


VALID_STATES = {state.value for state in GenerationState}

VALID_COMMANDS = {command.value for command in GenerationCommandType}

# ============================================================
# 状态转换规则表
# key:  (command_type, from_state)
# value: to_state
# ============================================================

# 每个命令允许从哪些状态发起 -> 转移后的新状态
_TRANSITION_TABLE: dict[tuple[str, str], str] = {
    # UPDATE_OUTLINE：允许在等待确认或已有草稿时修改
    (
        GenerationCommandType.UPDATE_OUTLINE.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    ): GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    (
        GenerationCommandType.UPDATE_OUTLINE.value,
        GenerationState.DRAFTING_OUTLINE.value,
    ): GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    # REDRAFT_OUTLINE：AI 重写大纲
    (
        GenerationCommandType.REDRAFT_OUTLINE.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    ): GenerationState.DRAFTING_OUTLINE.value,
    (
        GenerationCommandType.REDRAFT_OUTLINE.value,
        GenerationState.DRAFTING_OUTLINE.value,
    ): GenerationState.DRAFTING_OUTLINE.value,
    # CONFIRM_OUTLINE：确认大纲，触发内容生成
    (
        GenerationCommandType.CONFIRM_OUTLINE.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
    ): GenerationState.GENERATING_CONTENT.value,
    # REGENERATE_SLIDE：局部重绘，仅在 SUCCESS 或 RENDERING 后允许
    (
        GenerationCommandType.REGENERATE_SLIDE.value,
        GenerationState.SUCCESS.value,
    ): GenerationState.RENDERING.value,
    (
        GenerationCommandType.REGENERATE_SLIDE.value,
        GenerationState.RENDERING.value,
    ): GenerationState.RENDERING.value,
    # RESUME_SESSION：从 FAILED 或任意中断态恢复
    (
        GenerationCommandType.RESUME_SESSION.value,
        GenerationState.FAILED.value,
    ): GenerationState.CONFIGURING.value,
    (
        GenerationCommandType.RESUME_SESSION.value,
        GenerationState.ANALYZING.value,
    ): GenerationState.ANALYZING.value,
    (
        GenerationCommandType.RESUME_SESSION.value,
        GenerationState.DRAFTING_OUTLINE.value,
    ): GenerationState.DRAFTING_OUTLINE.value,
    (
        GenerationCommandType.RESUME_SESSION.value,
        GenerationState.GENERATING_CONTENT.value,
    ): GenerationState.GENERATING_CONTENT.value,
    (
        GenerationCommandType.RESUME_SESSION.value,
        GenerationState.RENDERING.value,
    ): GenerationState.RENDERING.value,
}

# 每个状态允许的下一步动作（用于 allowed_actions 响应字段）
_ALLOWED_ACTIONS: dict[str, list[str]] = {
    GenerationState.IDLE.value: ["configure"],
    GenerationState.CONFIGURING.value: ["analyze", "cancel"],
    GenerationState.ANALYZING.value: ["resume_session", "cancel"],
    GenerationState.DRAFTING_OUTLINE.value: [
        "update_outline",
        "redraft_outline",
        "resume_session",
    ],
    GenerationState.AWAITING_OUTLINE_CONFIRM.value: [
        "update_outline",
        "redraft_outline",
        "confirm_outline",
    ],
    GenerationState.GENERATING_CONTENT.value: ["resume_session", "cancel"],
    GenerationState.RENDERING.value: ["regenerate_slide", "resume_session"],
    GenerationState.SUCCESS.value: ["regenerate_slide", "export"],
    GenerationState.FAILED.value: ["resume_session"],
}


# ============================================================
# 校验结果数据类
# ============================================================


@dataclass
class TransitionResult:
    """状态转换校验结果"""

    allowed: bool
    from_state: str
    to_state: Optional[str]  # 允许时为目标状态，拒绝时为 None
    command_type: str
    validated_by: str = "StateTransitionGuard"
    reject_reason: Optional[str] = None  # 拒绝时的说明


# ============================================================
# 校验器主类
# ============================================================


class StateTransitionGuard:
    """
    会话状态转换校验器（契约强制）。

    所有 commands 写操作都必须调用 validate() 后再执行业务逻辑。
    验收要求：响应中包含 transition.validated_by=StateTransitionGuard。
    """

    VALIDATOR_NAME = "StateTransitionGuard"

    def validate(
        self,
        current_state: str,
        command_type: str,
    ) -> TransitionResult:
        """
        校验指定状态下是否允许执行该命令。

        Args:
            current_state: 会话当前状态（VALID_STATES 之一）
            command_type:  命令类型（VALID_COMMANDS 之一）

        Returns:
            TransitionResult，allowed=True 时含目标状态，False 时含拒绝原因。
        """
        # 1. 输入合法性
        if current_state not in VALID_STATES:
            return TransitionResult(
                allowed=False,
                from_state=current_state,
                to_state=None,
                command_type=command_type,
                reject_reason=f"未知会话状态：{current_state}",
            )
        if command_type not in VALID_COMMANDS:
            return TransitionResult(
                allowed=False,
                from_state=current_state,
                to_state=None,
                command_type=command_type,
                reject_reason=f"未知命令类型：{command_type}",
            )

        # 2. 查规则表
        to_state = _TRANSITION_TABLE.get((command_type, current_state))
        if to_state is None:
            return TransitionResult(
                allowed=False,
                from_state=current_state,
                to_state=None,
                command_type=command_type,
                reject_reason=(
                    f"当前状态 {current_state} 不允许执行 {command_type}，"
                    f"可操作动作：{_ALLOWED_ACTIONS.get(current_state, [])}"
                ),
            )

        logger.debug(
            "StateTransitionGuard: %s [%s -> %s] allowed",
            command_type,
            current_state,
            to_state,
        )
        return TransitionResult(
            allowed=True,
            from_state=current_state,
            to_state=to_state,
            command_type=command_type,
        )

    @staticmethod
    def get_allowed_actions(state: str) -> list[str]:
        """返回指定状态下允许的下一步动作列表（用于响应 allowed_actions 字段）。"""
        return list(_ALLOWED_ACTIONS.get(state, []))

    @staticmethod
    def get_transitions() -> list[dict[str, str]]:
        """返回公开的状态迁移表，用于 capability/state-machine 声明。"""
        return [
            {
                "command_type": cmd_type,
                "from_state": from_state,
                "to_state": to_state,
            }
            for (cmd_type, from_state), to_state in _TRANSITION_TABLE.items()
        ]


# 全局单例
state_transition_guard = StateTransitionGuard()
