"""课件质量评估服务。"""

from services.quality_service.models import QualityIssue, QualityReport
from services.quality_service.service import MAX_WORDS_PER_SLIDE, check_quality

__all__ = [
    "MAX_WORDS_PER_SLIDE",
    "QualityIssue",
    "QualityReport",
    "check_quality",
]
