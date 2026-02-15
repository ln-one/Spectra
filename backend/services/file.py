import uuid
from datetime import datetime
from pathlib import Path

import aiofiles


class FileService:
    """Service for file operations"""

    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = Path(upload_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def save_file(self, filename: str, content: bytes) -> tuple[str, int]:
        """
        Save a file to the upload directory

        Args:
            filename: Name of the file
            content: File content as bytes

        Returns:
            tuple of (filepath, file_size)
        """
        # Generate unique filename with timestamp and UUID to prevent collisions
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        safe_filename = f"{timestamp}_{unique_id}_{filename}"
        filepath = self.upload_dir / safe_filename

        async with aiofiles.open(filepath, "wb") as f:
            await f.write(content)

        file_size = len(content)
        return str(filepath), file_size


# Global file service instance
file_service = FileService()
