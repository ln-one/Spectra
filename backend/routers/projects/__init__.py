from fastapi import APIRouter

from .detail import router as detail_router
from .listing import router as listing_router

router = APIRouter(tags=["Project"])
router.include_router(listing_router, prefix="/projects")
router.include_router(detail_router, prefix="/projects")
