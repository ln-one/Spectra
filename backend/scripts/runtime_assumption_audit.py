#!/usr/bin/env python3
"""Scan the codebase for local-runtime defaults that block product deployment."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
DOCS_ROOT = ROOT / "docs"


@dataclass(frozen=True)
class AssumptionPattern:
    name: str
    needle: str
    scope: tuple[Path, ...]


PATTERNS = (
    AssumptionPattern(
        name="sqlite_default",
        needle="file:./dev.db",
        scope=(BACKEND_ROOT, DOCS_ROOT),
    ),
    AssumptionPattern(
        name="local_uploads_default",
        needle='"uploads"',
        scope=(BACKEND_ROOT,),
    ),
    AssumptionPattern(
        name="local_generated_default",
        needle='"generated"',
        scope=(BACKEND_ROOT,),
    ),
    AssumptionPattern(
        name="local_chroma_default",
        needle="./chroma_data",
        scope=(BACKEND_ROOT, DOCS_ROOT),
    ),
    AssumptionPattern(
        name="localhost_api_default",
        needle="http://localhost:8000",
        scope=(BACKEND_ROOT, DOCS_ROOT),
    ),
)


def _iter_files(root: Path) -> list[Path]:
    return [
        path
        for path in root.rglob("*")
        if path.is_file()
        and ".git" not in path.parts
        and "__pycache__" not in path.parts
        and "node_modules" not in path.parts
        and path.suffix in {".py", ".md", ".yml", ".yaml", ".ts", ".tsx"}
    ]


def _find_hits(pattern: AssumptionPattern) -> list[str]:
    hits: list[str] = []
    seen: set[Path] = set()

    for scope_root in pattern.scope:
        for path in _iter_files(scope_root):
            if path in seen:
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
