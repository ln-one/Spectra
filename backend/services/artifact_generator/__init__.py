"""Local non-office artifact helpers.

This package owns storage-path helpers plus JSON/media/animation file helpers.
PPTX/DOCX render authority lives in Pagevra, not in backend-local generators.
"""

from services.artifact_generator.service import ArtifactGenerator

artifact_generator = ArtifactGenerator()

__all__ = ["ArtifactGenerator", "artifact_generator"]
