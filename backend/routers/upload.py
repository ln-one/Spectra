from fastapi import APIRouter, UploadFile, File, HTTPException
import logging
from services import file_service, db_service
from schemas import UploadResponse

router = APIRouter(prefix="/upload", tags=["Upload"])
logger = logging.getLogger(__name__)


@router.post("", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a file to the server
    
    Args:
        file: The file to upload
        
    Returns:
        UploadResponse with file details
    """
    try:
        # Read file content
        content = await file.read()
        
        # Save file
        filepath, file_size = await file_service.save_file(file.filename, content)
        
        # Record upload in database
        upload = await db_service.create_upload(
            filename=file.filename,
            filepath=filepath,
            size=file_size,
        )
        
        return upload
    except Exception as e:
        logger.error(f"Failed to upload file: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload file")
