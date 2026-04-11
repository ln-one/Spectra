from __future__ import annotations

from fastapi import APIRouter, Depends

from routers.generate_sessions.shared import CONTRACT_VERSION
from services.generation_session_service import _default_capabilities
from services.generation_session_service.card_capabilities import (
    get_studio_card_capabilities,
)
from services.platform.state_transition_guard import (
    VALID_COMMANDS,
    VALID_STATES,
    GenerationState,
    state_transition_guard,
)
from utils.dependencies import get_current_user
from utils.responses import success_response

router = APIRouter()


@router.get("/capabilities")
async def get_capabilities(
    user_id: str = Depends(get_current_user),
):
    """返回服务端当前支持的契约版本、特性开关与弃用信息。"""
    transitions = state_transition_guard.get_transitions()

    return success_response(
        data={
            "contract_versions": [CONTRACT_VERSION],
            "default_contract_version": CONTRACT_VERSION,
            "command_interface": {
                "endpoint": "/api/v1/generate/sessions/{session_id}/commands",
                "supported_commands": sorted(VALID_COMMANDS),
            },
            "capabilities": _default_capabilities(),
            "studio_cards": get_studio_card_capabilities(),
            "state_machine": {
                "states": sorted(VALID_STATES),
                "terminal_states": [
                    GenerationState.SUCCESS.value,
                    GenerationState.FAILED.value,
                ],
                "transitions": transitions,
            },
            "deprecations": [],
        },
        message="能力声明获取成功",
    )
