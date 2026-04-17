"""Interactive game HTML rendering."""

from __future__ import annotations

import json
from typing import Any

from .concept_match import _concept_match_template
from .fill_in_blank import _fill_in_blank_template
from .quiz_challenge import _quiz_challenge_template
from .schema import is_template_game_pattern, resolve_game_pattern, validate_game_data
from .timeline_sort import _timeline_sort_template


def _safe_json_for_script(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


_HTML_TEMPLATES = {
    "timeline_sort": _timeline_sort_template(),
    "concept_match": _concept_match_template(),
    "quiz_challenge": _quiz_challenge_template(),
    "fill_in_blank": _fill_in_blank_template(),
}


def render_game_html(pattern: str, data: dict[str, Any]) -> str:
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")
    validate_game_data(pattern, data)
    template = _HTML_TEMPLATES[pattern]
    return template.replace("__GAME_DATA__", _safe_json_for_script(data))
