from typing import Optional

from schemas.project_space import ReferenceMode, ReferenceRelationType, ReferenceStatus


def normalize_reference_relation_type(
    value: ReferenceRelationType | str,
) -> ReferenceRelationType:
    return (
        value
        if isinstance(value, ReferenceRelationType)
        else ReferenceRelationType(value)
    )


def normalize_reference_mode(value: ReferenceMode | str) -> ReferenceMode:
    return value if isinstance(value, ReferenceMode) else ReferenceMode(value)


def normalize_reference_status(
    value: ReferenceStatus | str,
) -> ReferenceStatus:
    return value if isinstance(value, ReferenceStatus) else ReferenceStatus(value)


def resolve_reference_pin_state(
    mode: ReferenceMode | str,
    pinned_version_id: Optional[str],
) -> tuple[ReferenceMode, Optional[str]]:
    normalized_mode = normalize_reference_mode(mode)
    if normalized_mode is ReferenceMode.FOLLOW:
        return normalized_mode, None
    return normalized_mode, pinned_version_id
