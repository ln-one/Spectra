import logging

from services.artifact_generator.cloud_video import (
    render_aliyun_wan_video,
    should_use_aliyun_wan_video,
)
from services.artifact_generator.storyboard_renderer import render_gif, render_mp4

logger = logging.getLogger(__name__)


class ArtifactMediaMixin:
    async def generate_animation(
        self, content, project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "gif", artifact_id)
        actual_path = render_gif(content or {}, storage_path)
        logger.info("Generated animation GIF at %s", actual_path)
        return actual_path

    async def generate_html(
        self, content: str, project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "html", artifact_id)
        with open(storage_path, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info("Generated HTML at %s", storage_path)
        return storage_path

    async def generate_video(self, content, project_id: str, artifact_id: str) -> str:
        storage_path = self.get_storage_path(project_id, "mp4", artifact_id)
        if should_use_aliyun_wan_video(content or {}):
            actual_path = await render_aliyun_wan_video(content or {}, storage_path)
        else:
            actual_path = render_mp4(content or {}, storage_path)
        logger.info("Generated MP4 at %s", actual_path)
        return actual_path
