import logging

logger = logging.getLogger(__name__)


class ArtifactMediaMixin:
    async def generate_animation(
        self, content, project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "gif", artifact_id)
        gif_bytes = (
            b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
            b"\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00"
            b",\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
        )
        with open(storage_path, "wb") as f:
            f.write(gif_bytes)
        logger.info("Generated animation placeholder GIF at %s", storage_path)
        return storage_path

    async def generate_html(
        self, content: str, project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "html", artifact_id)
        with open(storage_path, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info("Generated HTML at %s", storage_path)
        return storage_path

    async def generate_video_placeholder(
        self, project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "mp4", artifact_id)
        mp4_bytes = (
            b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" b"\x00\x00\x00\x08free"
        )
        with open(storage_path, "wb") as f:
            f.write(mp4_bytes)
        logger.info("Generated MP4 placeholder at %s", storage_path)
        return storage_path
