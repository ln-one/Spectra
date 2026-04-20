from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROUTER_PATH = REPO_ROOT / "backend" / "routers" / "generate_sessions" / "studio_cards.py"
OPENAPI_PATH = (
    REPO_ROOT / "docs" / "openapi" / "paths" / "generate-session-core.yaml"
)

_ROUTER_DECORATOR_RE = re.compile(
    r'@router\.(?:get|post|put|patch|delete)\("([^"]+)"\)'
)
_OPENAPI_PATH_KEY_RE = re.compile(r"^(/api/v1/generate/[^\s:]+):\s*$", re.MULTILINE)


def _extract_router_paths() -> set[str]:
    router_text = ROUTER_PATH.read_text(encoding="utf-8")
    return {
        f"/api/v1/generate{path}"
        for path in _ROUTER_DECORATOR_RE.findall(router_text)
        if path.startswith("/studio-cards/")
    }


def _extract_openapi_paths() -> set[str]:
    openapi_text = OPENAPI_PATH.read_text(encoding="utf-8")
    return set(_OPENAPI_PATH_KEY_RE.findall(openapi_text))


def test_studio_card_router_paths_are_declared_in_openapi_source():
    router_paths = _extract_router_paths()
    openapi_paths = _extract_openapi_paths()

    missing = sorted(router_paths - openapi_paths)
    assert missing == [], f"OpenAPI 缺少 studio-cards 路径: {missing}"
