"""Session-First 生成路由聚合入口。"""

from fastapi import APIRouter

from routers.generate_sessions.candidate_change_api import (
    router as candidate_change_router,
)
from routers.generate_sessions.capabilities import router as capabilities_router
from routers.generate_sessions.commands import router as commands_router
from routers.generate_sessions.core import router as core_router
from routers.generate_sessions.preview import router as preview_router
from routers.generate_sessions.runs import router as runs_router
from routers.generate_sessions.studio_cards import router as studio_cards_router

router = APIRouter(prefix="/generate", tags=["Generate"])

router.include_router(capabilities_router)
router.include_router(studio_cards_router)
router.include_router(core_router)
router.include_router(commands_router)
router.include_router(candidate_change_router)
router.include_router(preview_router)
router.include_router(runs_router)
