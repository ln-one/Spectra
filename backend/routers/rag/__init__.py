from fastapi import APIRouter

from .core import router as core_router
from .enrichment import router as enrichment_router

router = APIRouter(prefix="/rag", tags=["RAG"])
router.include_router(core_router)
router.include_router(enrichment_router)
