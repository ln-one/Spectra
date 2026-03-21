import os


def allow_office_placeholder_artifacts() -> bool:
    return os.getenv("ALLOW_OFFICE_PLACEHOLDER_ARTIFACTS", "false").lower() == "true"


def allow_media_placeholder_artifacts() -> bool:
    return os.getenv("ALLOW_MEDIA_PLACEHOLDER_ARTIFACTS", "false").lower() == "true"
