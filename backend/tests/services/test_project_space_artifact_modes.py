from schemas.project_space import ArtifactMutationMode
from services.project_space_service.artifact_modes import normalize_artifact_mode


def test_normalize_artifact_mode_accepts_enum_values() -> None:
    assert normalize_artifact_mode(ArtifactMutationMode.CREATE) == "create"
    assert normalize_artifact_mode(ArtifactMutationMode.REPLACE) == "replace"
