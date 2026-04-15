"""Animation spec normalization package with legacy-compatible exports."""

from .normalization import normalize_animation_spec
from .semantics import infer_layout_type, infer_subject_family, infer_visual_type
from .text import derive_animation_title

__all__ = [
    "derive_animation_title",
    "infer_layout_type",
    "infer_subject_family",
    "infer_visual_type",
    "normalize_animation_spec",
]
