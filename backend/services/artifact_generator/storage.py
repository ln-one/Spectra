import logging
from pathlib import Path

from services.project_space_service.artifact_semantics import get_artifact_extension

logger = logging.getLogger(__name__)


class ArtifactStorageMixin:
    def get_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        ext = get_artifact_extension(artifact_type)
        type_dir = Path(self.base_dir) / project_id / artifact_type
        type_dir.mkdir(parents=True, exist_ok=True)
        return str(type_dir / f"{artifact_id}.{ext}")
