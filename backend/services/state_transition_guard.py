"""
StateTransitionGuard - 会话状态转换校验器

按 OpenAPI 契约强制校验会话命令的状态可达性。
所有经过 /generate/sessions/{id}/commands 的写操作必须经过本模块校验。

契约参考：docs/openapi.yaml GenerationState / GenerationCommandType
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ============================================================
# State & Command 枚举（与 OpenAPI GenerationState / GenerationCommandType 对齐）
# ============================================================

VALID_STATES = {
    "IDLE",
    "CONFIGURING",
    "ANALYZING",
    "DRAFTING_OUTLINE",
    "AWAITING_OUTLINE_CONFIRM",
    "GENERATING_CONTENT",
    "RENDERING",
    "SUCCESS",
    "FAILED",
}

VALID_COMMANDS = {
    "UPDATE_OUTLINE",
    "REDRAFT_OUTLINE",
    "CONFIRM_OUTLINE",
    "REGENERATE_SLIDE",
    "RESUME_SESSION",
}

# ============================================================
# 状态转换规则表
# key:  (command_type, from_state)
# value: to_state
# ============================================================

# 每个命令允许从哪些状态发起 -> 转移后的新状态
_TRANSITION_TABLE: dict[tuple[str, str], str] = {
    # UPDATE_OUTLINE：允许在等待确认或已有草稿时修改
    ("UPDATE_OUTLINE", "AWAITING_OUTLINE_CONFIRM"): "AWAITING_OUTLINE_CONFIRM",
    ("UPDATE_OUTLINE", "DRAFTING_OUTLINE"): "AWAITING_OUTLINE_CONFIRM",
    # REDRAFT_OUTLINE：AI 重写大纲
    ("REDRAFT_OUTLINE", "AWAITING_OUTLINE_CONFIRM"): "DRAFTING_OUTLINE",
    ("REDRAFT_OUTLINE", "DRAFTING_OUTLINE"): "DRAFTING_OUTLINE",
    # CONFIRM_OUTLINE：确认大纲，触发内容生成
    ("CONFIRM_OUTLINE", "AWAITING_OUTLINE_CONFIRM"): "GENERATING_CONTENT",
    # REGENERATE_SLIDE：局部重绘，仅在 SUCCESS 或 RENDERING 后允许
    ("REGENERATE_SLIDE", "SUCCESS"): "RENDERING",
    ("REGENERATE_SLIDE", "RENDERING"): "RENDERING",
    # RESUME_SESSION：从 FAILED 或任意中断态恢复
    ("RESUME_SESSION", "FAILED"): "CONFIGURING",
    ("RESUME_SESSION", "ANALYZING"): "ANALYZING",
    ("RESUME_SESSION", "DRAFTING_OUTLINE"): "DRAFTING_OUTLINE",
    ("RESUME_SESSION", "GENERATING_CONTENT"): "GENERATING_CONTENT",
    ("RESUME_SESSION", "RENDERING"): "RENDERING",
}

# 每个状态允许的下一步动作（用于 allowed_actions 响应字段）
_ALLOWED_ACTIONS: dict[str, list[str]] = {
    "IDLE": ["configure"],
    "CONFIGURING": ["analyze", "cancel"],
    "ANALYZING": ["resume_session", "cancel"],
    "DRAFTING_OUTLINE": ["update_outline", "redraft_outline", "resume_session"],
    "AWAITING_OUTLINE_CONFIRM": [
        "update_outline",
        "redraft_outline",
        "confirm_outline",
    ],
    "GENERATING_CONTENT": ["resume_session", "cancel"],
    "RENDERING": ["regenerate_slide", "resume_session"],
    "SUCCESS": ["regenerate_slide", "export"],
    "FAILED": ["resume_session"],
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


# 全局单例
state_transition_guard = StateTransitionGuard()
