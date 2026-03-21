import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_ARTIFACT_EXTENSION_MAP = {
    "pptx": "pptx",
    "docx": "docx",
    "mindmap": "json",
    "summary": "json",
    "exercise": "json",
    "html": "html",
    "gif": "gif",
    "mp4": "mp4",
}


def _get_artifact_extension(artifact_type: str) -> str:
    return _ARTIFACT_EXTENSION_MAP.get(str(artifact_type).strip().lower(), "bin")


class ArtifactStorageMixin:
    def get_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        ext = _get_artifact_extension(artifact_type)
        type_dir = Path(self.base_dir) / project_id / artifact_type
        type_dir.mkdir(parents=True, exist_ok=True)
        return str(type_dir / f"{artifact_id}.{ext}")
