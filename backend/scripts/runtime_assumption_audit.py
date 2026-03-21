#!/usr/bin/env python3
"""Scan the codebase for local-runtime defaults that block product deployment."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
SCRIPT_FILE = Path(__file__).resolve()
RUNTIME_SCOPE = (
    BACKEND_ROOT / "main.py",
    BACKEND_ROOT / "worker.py",
    BACKEND_ROOT / "app_setup",
    BACKEND_ROOT / "routers",
    BACKEND_ROOT / "services",
    BACKEND_ROOT / "utils",
)
EXCLUDED_PARTS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    "tests",
    "archived",
}


@dataclass(frozen=True)
class AssumptionPattern:
    name: str
    needle: str
    scope: tuple[Path, ...]


PATTERNS = (
    AssumptionPattern(
        name="sqlite_default",
        needle="file:./dev.db",
        scope=RUNTIME_SCOPE,
    ),
    AssumptionPattern(
        name="local_uploads_default",
        needle='"uploads"',
        scope=RUNTIME_SCOPE,
    ),
    AssumptionPattern(
        name="local_generated_default",
        needle='"generated"',
        scope=RUNTIME_SCOPE,
    ),
    AssumptionPattern(
        name="local_chroma_default",
        needle="chroma_data",
        scope=RUNTIME_SCOPE,
    ),
    AssumptionPattern(
        name="localhost_api_default",
        needle="http://localhost:8000",
        scope=RUNTIME_SCOPE,
    ),
)


def _iter_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    if not root.exists():
        return []
    return [
        path
        for path in root.rglob("*")
        if path.is_file()
        and not (set(path.parts) & EXCLUDED_PARTS)
        and path.suffix in {".py", ".md", ".yml", ".yaml", ".ts", ".tsx"}
    ]


def _find_hits(pattern: AssumptionPattern) -> list[str]:
    hits: list[str] = []
    seen: set[Path] = set()

    for scope_root in pattern.scope:
        for path in _iter_files(scope_root):
            if path in seen:
                continue
            if path.resolve() == SCRIPT_FILE:
                continue
            seen.add(path)
            text = path.read_text(encoding="utf-8", errors="replace")
            if pattern.needle not in text:
                continue
            for lineno, line in enumerate(text.splitlines(), start=1):
                if pattern.needle in line:
                    hits.append(f"{path}:{lineno}: {line.strip()}")

    return hits


def evaluate_runtime_assumptions() -> tuple[list[str], int]:
    messages = ["Runtime assumption audit"]
    failures = 0

    for pattern in PATTERNS:
        hits = _find_hits(pattern)
        if hits:
            messages.append(
                f"WARN {pattern.name} still appears in {len(hits)} location(s)"
            )
            messages.extend(f"  - {hit}" for hit in hits[:10])
            if len(hits) > 10:
                messages.append(f"  - ... and {len(hits) - 10} more")
        else:
            messages.append(f"PASS {pattern.name} no longer appears in scoped files")

    return messages, failures


def main() -> int:
    messages, failures = evaluate_runtime_assumptions()
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
