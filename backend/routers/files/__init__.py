from fastapi import APIRouter

from .mutations import router as mutations_router
from .shared import BatchDeleteRequest, UpdateFileIntentRequest, cleanup_file
from .uploads import router as uploads_router

router = APIRouter(tags=["Files"])
router.include_router(uploads_router, prefix="/files")
router.include_router(mutations_router, prefix="/files")

__all__ = [
    "BatchDeleteRequest",
    "UpdateFileIntentRequest",
    "cleanup_file",
    "router",
]
