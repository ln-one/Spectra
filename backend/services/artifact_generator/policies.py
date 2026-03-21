import os


def allow_office_placeholder_artifacts() -> bool:
    return os.getenv("ALLOW_OFFICE_PLACEHOLDER_ARTIFACTS", "false").lower() == "true"
