"""Browser HTML template used by the animation renderer."""

from .template_parts.part_01 import PART as _PART_01
from .template_parts.part_02 import PART as _PART_02
from .template_parts.part_03 import PART as _PART_03
from .template_parts.part_04 import PART as _PART_04
from .template_parts.part_05 import PART as _PART_05
from .template_parts.part_06 import PART as _PART_06
from .template_parts.part_07 import PART as _PART_07
from .template_parts.part_08 import PART as _PART_08

_HTML_TEMPLATE = "".join(
    [
        _PART_01,
        _PART_02,
        _PART_03,
        _PART_04,
        _PART_05,
        _PART_06,
        _PART_07,
        _PART_08,
    ]
)
