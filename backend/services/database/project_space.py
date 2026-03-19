from .project_space_artifacts import ProjectSpaceArtifactMixin
from .project_space_changes import ProjectSpaceChangeMixin
from .project_space_members import ProjectSpaceMemberMixin
from .project_space_references import ProjectSpaceReferenceMixin


class ProjectSpaceMixin(
    ProjectSpaceReferenceMixin,
    ProjectSpaceArtifactMixin,
    ProjectSpaceChangeMixin,
    ProjectSpaceMemberMixin,
):
    """Compose project-space persistence concerns into smaller mixins."""
