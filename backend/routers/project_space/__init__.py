"""Project Space router package."""

from fastapi import APIRouter

from .artifacts import router as artifacts_router
from .members import router as members_router
from .references import router as references_router
from .versions import router as versions_router

router = APIRouter(prefix="/projects", tags=["Project Space"])
router.include_router(versions_router)
router.include_router(artifacts_router)
router.include_router(references_router)
router.include_router(members_router)

__all__ = ["router"]
