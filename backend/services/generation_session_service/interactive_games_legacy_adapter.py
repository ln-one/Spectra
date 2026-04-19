from __future__ import annotations

from typing import Any

from services.generation_session_service.game_template_engine import (
    build_game_schema_hint,
    is_template_game_pattern,
    render_game_html,
    resolve_game_pattern,
    validate_game_data,
)

LEGACY_COMPATIBILITY_ZONE = {
    "active": True,
    "zone": "interactive_games_legacy_compatibility",
    "adapter": "interactive_games_legacy_adapter",
    "strategy": "legacy_template_runtime",
    "status": "protocol_limited",
    "notes": (
        "当前游戏卡仍通过 legacy template/runtime compatibility 层承托，"
        "只允许作为冻结清理区存在，不再扩张为正式第二运行时。"
    ),
}


def resolve_interactive_game_schema_hint(
    config: dict[str, Any] | None = None,
) -> str:
    pattern = resolve_game_pattern(config)
    if is_template_game_pattern(pattern):
        return build_game_schema_hint(pattern)
    return '{"title":"", "html":""}'


def normalize_interactive_game_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    pattern = resolve_game_pattern(config)
    if not is_template_game_pattern(pattern):
        normalized = dict(payload)
        normalized.setdefault("kind", "interactive_game")
        normalized.setdefault("compatibility_zone", dict(LEGACY_COMPATIBILITY_ZONE))
        normalized.setdefault("runtime_origin", "legacy_compatibility")
        return normalized
    game_data = payload.get("game_data") if isinstance(payload.get("game_data"), dict) else payload
    validate_game_data(pattern, game_data)
    return {
        "kind": "interactive_game",
        "title": str(game_data.get("game_title") or (config or {}).get("topic") or "互动游戏").strip(),
        "summary": str(game_data.get("instruction") or "").strip(),
        "game_pattern": pattern,
        "game_data": game_data,
        "html": render_game_html(pattern, game_data),
        "compatibility_zone": dict(LEGACY_COMPATIBILITY_ZONE),
        "runtime_origin": "legacy_compatibility",
    }
