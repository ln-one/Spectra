#!/usr/bin/env python3
"""Scan compatibility-oriented imports that are candidates for retirement."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED_PARTS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".next"}
SELF = Path(__file__).resolve()


def classify_line(line: str) -> str | None:
    stripped = line.strip()
    if stripped.startswith("from services import "):
        return "legacy_service_exports"
    if stripped.startswith("import services."):
        return "service_package_import"
    if stripped.startswith("from routers import "):
        return "legacy_router_exports"
    if stripped.startswith("import routers."):
        return "router_package_import"
    if stripped.startswith("from services.generation_session_service.helpers import "):
        return "generation_helper_bridge"
    if stripped.startswith("import services.generation_session_service.helpers"):
        return "generation_helper_bridge"
    return None


@dataclass(frozen=True)
class Hit:
    category: str
    path: Path
    line_no: int
    line: str


def iter_python_files(root: Path):
    for path in root.rglob("*.py"):
        if path.resolve() == SELF:
            continue
        if any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        yield path


def collect_hits(root: Path) -> list[Hit]:
    hits: list[Hit] = []
    for path in iter_python_files(root):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_no, line in enumerate(lines, 1):
            category = classify_line(line)
            if category:
                hits.append(Hit(category, path, line_no, line.strip()))
    return hits


def main() -> int:
    hits = collect_hits(ROOT)
    categories = [
        "legacy_service_exports",
        "service_package_import",
        "legacy_router_exports",
        "router_package_import",
        "generation_helper_bridge",
    ]
    grouped: dict[str, list[Hit]] = {category: [] for category in categories}
    for hit in hits:
        grouped[hit.category].append(hit)

    print("Compatibility Surface Audit")
    print(f"- Root: {ROOT}")
    print(f"- Hits: {len(hits)}")
    for category in categories:
        items = grouped[category]
        print(f"\n[{category}] {len(items)}")
        for hit in items:
            rel = hit.path.relative_to(ROOT)
            print(f"- {rel}:{hit.line_no}: {hit.line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
