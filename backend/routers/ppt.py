from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from services.database import db_service
from services.generation_session_service.ppt_slide_regenerate import (
    regenerate_diego_slide_for_run,
)
from utils.dependencies import get_current_user

router = APIRouter()


class RegenerateSlideBody(BaseModel):
    instruction: str = Field(min_length=1)
    preserve_style: bool = True


@router.post("/ppt/runs/{run_id}/slides/{slide_no}/regenerate")
async def regenerate_ppt_slide(
    run_id: str,
    slide_no: int,
    body: RegenerateSlideBody,
    user_id: str = Depends(get_current_user),
):
    return await regenerate_diego_slide_for_run(
        db=db_service.db,
        run_id=run_id,
        slide_no=slide_no,
        instruction=body.instruction,
        preserve_style=body.preserve_style,
        user_id=user_id,
    )
