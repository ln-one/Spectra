"""Session-First 生成路由聚合入口。"""

from fastapi import APIRouter

from routers.generate_sessions.candidate_change_api import (
    router as candidate_change_router,
)
from routers.generate_sessions.commands import router as commands_router
from routers.generate_sessions.core import router as core_router
from routers.generate_sessions.preview import router as preview_router

router = APIRouter(prefix="/generate", tags=["Generate"])

router.include_router(core_router)
router.include_router(commands_router)
router.include_router(candidate_change_router)
router.include_router(preview_router)
