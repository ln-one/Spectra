"""Validate generation event literals against OpenAPI GenerationEventType enum.

Usage:
    python backend/scripts/check_generation_event_contract.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OPENAPI_ENUM_FILE = ROOT / "docs" / "openapi" / "schemas" / "generate-core.yaml"
SCAN_FILES = [
    ROOT / "backend" / "services" / "generation_session_service" / "service.py",
    ROOT / "backend" / "services" / "task_executor" / "generation.py",
    ROOT / "backend" / "services" / "task_recovery.py",
]


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _extract_openapi_enum(path: Path) -> set[str]:
    text = _read_text(path)
    match = re.search(
        r"GenerationEventType:\s*[\r\n]+(?:[ \t]+.*[\r\n]+)*?[ \t]+enum:\s*[\r\n]+"
        r"((?:[ \t]+- [^\r\n]+[\r\n]+)+)",
        text,
        flags=re.MULTILINE,
    )
    if not match:
        raise RuntimeError(
            f"Failed to locate GenerationEventType enum in: {path.as_posix()}"
        )

    block = match.group(1)
    values = set()
    for line in block.splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        values.add(line[2:].strip())
    return values


def _extract_code_literals(path: Path) -> set[str]:
    text = _read_text(path)
    values = set()

    for pattern in (
        r'event_type\s*=\s*"([^"]+)"',
        r'"eventType"\s*:\s*"([^"]+)"',
    ):
        values.update(re.findall(pattern, text))
    return values


def main() -> int:
    openapi_values = _extract_openapi_enum(OPENAPI_ENUM_FILE)

    code_values: set[str] = set()
    missing_files = []
    for file_path in SCAN_FILES:
        if not file_path.exists():
            missing_files.append(file_path.as_posix())
            continue
        code_values.update(_extract_code_literals(file_path))

    if missing_files:
        print("WARNING: skipped missing files:")
        for item in missing_files:
            print(f"  - {item}")

    unknown = sorted(code_values - openapi_values)
    if unknown:
        print("ERROR: found event literals not declared in OpenAPI enum:")
        for item in unknown:
            print(f"  - {item}")
        print("\nOpenAPI allowed event types:")
        for item in sorted(openapi_values):
            print(f"  - {item}")
        return 1

    print("OK: generation event literals are aligned with OpenAPI enum.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
