from fastapi import APIRouter, HTTPException
import logging
from services import ai_service
from schemas import GenerateRequest, GenerateResponse

router = APIRouter(prefix="/generate", tags=["AI"])
logger = logging.getLogger(__name__)


@router.post("", response_model=GenerateResponse)
async def generate_content(request: GenerateRequest):
    """
    Generate AI content using LiteLLM
    
    Args:
        request: Generation request with prompt and optional parameters
        
    Returns:
        GenerateResponse with generated content
    """
    try:
        result = await ai_service.generate(
            prompt=request.prompt,
            model=request.model,
            max_tokens=request.max_tokens,
        )
        
        return GenerateResponse(
            content=result["content"],
            model=result["model"],
            tokens_used=result.get("tokens_used"),
        )
    except Exception as e:
        logger.error(f"Failed to generate content: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate content")
