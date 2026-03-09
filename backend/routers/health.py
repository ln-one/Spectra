import logging

from fastapi import APIRouter

from services.capability_health import get_all_capabilities_health
from utils.responses import success_response

router = APIRouter(prefix="/health", tags=["Health"])
logger = logging.getLogger(__name__)


@router.get("/capabilities")
async def get_capabilities_health():
    """
    C4: 返回解析/视频/语音能力健康状态。

    返回字段复用统一 CapabilityStatus 契约，便于前端稳定展示降级提示。
    """
    capabilities = get_all_capabilities_health()
    return success_response(
        data={
            name: status.model_dump(mode="json")
            for name, status in capabilities.items()
        },
        message="获取能力健康状态成功",
    )
