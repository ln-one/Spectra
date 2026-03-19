from enum import Enum


class ProjectVisibility(str, Enum):
    PRIVATE = "private"
    SHARED = "shared"


class ProjectReferenceMode(str, Enum):
    FOLLOW = "follow"
    PINNED = "pinned"
