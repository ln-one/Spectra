"""Artifact generator service."""

import logging
from pathlib import Path

from services.artifact_generator.json_artifacts import ArtifactJsonMixin
from services.artifact_generator.media import ArtifactMediaMixin
from services.artifact_generator.office import ArtifactOfficeMixin
from services.artifact_generator.storage import ArtifactStorageMixin
from services.runtime_paths import get_artifact_storage_dir

logger = logging.getLogger(__name__)


class ArtifactGenerator(
    ArtifactStorageMixin,
    ArtifactJsonMixin,
    ArtifactOfficeMixin,
    ArtifactMediaMixin,
):
    """Artifact generation service for project space outputs."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir) if base_dir else get_artifact_storage_dir()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info("ArtifactGenerator initialized with base_dir: %s", self.base_dir)
