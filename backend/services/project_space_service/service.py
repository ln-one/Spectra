"""Project Space service orchestrator."""

import logging

from services.database import db_service

from .artifact_api import ProjectSpaceArtifactAPIMixin
from .member_api import ProjectSpaceMemberAPIMixin
from .reference_api import ProjectSpaceReferenceAPIMixin

logger = logging.getLogger(__name__)


class ProjectSpaceService(
    ProjectSpaceMemberAPIMixin,
    ProjectSpaceArtifactAPIMixin,
    ProjectSpaceReferenceAPIMixin,
):
    """Business logic service for project space features."""

    def __init__(self):
        self.db = db_service
        logger.info("ProjectSpaceService initialized")


project_space_service = ProjectSpaceService()
