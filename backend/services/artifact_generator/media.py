import logging

from services.artifact_generator.cloud_video import (
    render_aliyun_wan_video,
    should_use_aliyun_wan_video,
)
from services.artifact_generator.manim_renderer import (
    render_gif_via_manim,
    should_use_manim_renderer,
)
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
        normalized_content = dict(content or {})
        if (
            str(normalized_content.get("render_mode") or "").strip().lower()
            == "cloud_video_wan"
        ):
            logger.info(
                "Normalize animation render_mode from cloud_video_wan to gif "
                "for GIF artifact generation"
            )
            normalized_content["render_mode"] = "gif"
        # Manim renderer path (higher quality, no template)
        render_mode = normalized_content.get("render_mode")
        use_manim = should_use_manim_renderer(normalized_content)
        logger.info(
            "Animation render decision: render_mode=%s use_manim=%s",
            render_mode,
            use_manim,
        )
        if use_manim:
            try:
                actual_path = await render_gif_via_manim(
                    normalized_content, storage_path
                )
                logger.info("Generated Manim GIF at %s", actual_path)
                return actual_path
            except Exception as exc:
                logger.warning(
                    "Manim render failed (%r), falling back to SVG renderer", exc
                )
        # Legacy SVG/HTML template renderer
        actual_path = render_gif(normalized_content, storage_path)
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
            logger.info("Generated Aliyun Wan MP4 at %s", actual_path)
            return actual_path
        actual_path = render_mp4(content or {}, storage_path)
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
