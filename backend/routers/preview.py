"""
Preview Router (Skeleton)

Handles courseware preview and modification endpoints.
Returns 501 Not Implemented for all endpoints.
"""

import logging

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/preview", tags=["Preview"])
logger = logging.getLogger(__name__)


@router.get("/{task_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_preview(task_id: str):
    """
    Get courseware preview

    Args:
        task_id: Generation task ID

    TODO: Implement preview retrieval
    - Validate task_id
    - Get generation task from database
    - Return slides and lesson plan
    """
    logger.warning(f"GET /preview/{task_id} is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Get preview not implemented yet",
    )


@router.post("/{task_id}/modify", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def modify_courseware(task_id: str):
    """
    Submit modification instruction

    Args:
        task_id: Generation task ID

    TODO: Implement courseware modification
    - Validate request body (instruction, target_slides, context)
    - Create modification task
    - Process modification with AI
    - Return modification task status
    """
    logger.warning(f"POST /preview/{task_id}/modify is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Modify courseware not implemented yet",
    )
