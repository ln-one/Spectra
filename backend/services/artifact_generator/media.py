import logging

from services.artifact_generator.policies import allow_media_placeholder_artifacts
from services.artifact_generator.storyboard_renderer import render_gif, render_mp4

logger = logging.getLogger(__name__)


class ArtifactMediaMixin:
    @staticmethod
    def _should_emit_placeholder_artifact() -> bool:
        return allow_media_placeholder_artifacts()

    async def generate_animation(
        self, content, project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(project_id, "gif", artifact_id)
        try:
            actual_path = render_gif(content or {}, storage_path)
        except (ImportError, ModuleNotFoundError) as exc:
            logger.warning(
                "GIF rendering is unavailable for %s/%s: %s",
                project_id,
                artifact_id,
                exc,
            )
            raise RuntimeError(
                "GIF rendering requires Pillow and a compatible image backend."
            ) from exc
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
        try:
            actual_path = render_mp4(content or {}, storage_path)
        except (ImportError, ModuleNotFoundError) as exc:
            logger.warning(
                "MP4 rendering is unavailable for %s/%s: %s",
                project_id,
                artifact_id,
                exc,
            )
            raise RuntimeError(
                "MP4 rendering requires opencv-python. Try GIF or HTML output instead."
            ) from exc
        logger.info("Generated MP4 at %s", actual_path)
        return actual_path

    async def generate_video_placeholder(
        self, project_id: str, artifact_id: str
    ) -> str:
        if not self._should_emit_placeholder_artifact():
            raise RuntimeError(
                "MP4 rendering is not implemented and media placeholder artifacts "
                "are disabled. Enable ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS only for "
                "explicit dev fallback."
            )
        storage_path = self.get_storage_path(project_id, "mp4", artifact_id)
        mp4_bytes = (
            b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" b"\x00\x00\x00\x08free"
        )
        with open(storage_path, "wb") as f:
            f.write(mp4_bytes)
        logger.warning(
            "Generated MP4 placeholder at %s because "
            "ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS=true",
            storage_path,
        )
        return storage_path
