"""
Chat Router (Skeleton)

Handles chat/conversation endpoints.
Returns 501 Not Implemented for all endpoints.
"""

import logging

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)


@router.post("/messages", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def send_message():
    """
    Send a message and get AI response

    TODO: Implement message sending
    - Validate request body (project_id, content, history)
    - Save user message to database
    - Get conversation history
    - Call AI service to generate response
    - Save AI response to database
    - Return message with suggestions
    """
    logger.warning("POST /chat/messages is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Send message not implemented yet",
    )


@router.get("/messages", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def get_messages():
    """
    Get conversation history with pagination

    TODO: Implement message history retrieval
    - Validate query parameters (project_id, page, limit)
    - Get messages from database
    - Return paginated messages
    """
    logger.warning("GET /chat/messages is not implemented yet")
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Get messages not implemented yet",
    )
