#!/usr/bin/env python3
"""Lightweight architecture guard for backend code structure.

This script is intentionally advisory-first:
- file length > 300 lines => warning
- file length > 500 lines => error
- file length > 800 lines => critical error
- new top-level ``*_service.py`` files under ``backend/services`` => warning
- production ``from services import ...`` usage => warning

The goal is to surface architecture drift without blocking normal iteration on
healthy medium-sized files.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"

SCAN_ROOTS = [
    BACKEND_ROOT / "routers",
    BACKEND_ROOT / "services",
    BACKEND_ROOT / "app_setup",
    BACKEND_ROOT / "main.py",
]

IGNORE_DIR_NAMES = {
    "__pycache__",
    ".venv",
    "venv",
    "tests",
    "eval",
    "scripts",
    "archived",
}

EXPLICIT_IMPORT_ALLOWLIST = {
    BACKEND_ROOT / "services" / "ai" / "service.py",
    BACKEND_ROOT / "services" / "generation_session_service" / "task_runtime.py",
    BACKEND_ROOT / "services" / "task_executor" / "generation_error_handling.py",
    BACKEND_ROOT / "services" / "__init__.py",
}

TOP_LEVEL_SERVICE_ALLOWLIST = {
    BACKEND_ROOT / "services" / "auth_service.py",
    BACKEND_ROOT / "services" / "file_management_service.py",
    BACKEND_ROOT / "services" / "project_api_service.py",
}


@dataclass(slots=True)
class Finding:
    level: str
    path: Path
    message: str

    def render(self) -> str:
        rel = self.path.relative_to(REPO_ROOT)
        return f"[{self.level}] {rel}: {self.message}"


def iter_python_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if root.is_file():
            files.append(root)
            continue
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if any(part in IGNORE_DIR_NAMES for part in path.parts):
                continue
            files.append(path)
    return sorted(set(files))


def check_file_lengths(paths: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        line_count = sum(1 for _ in path.open("r", encoding="utf-8"))
        if line_count > 800:
            findings.append(
                Finding("critical", path, f"{line_count} lines; split immediately")
            )
        elif line_count > 500:
            findings.append(
                Finding(
                    "error", path, f"{line_count} lines; default action should be split"
                )
            )
        elif line_count > 300:
            findings.append(
                Finding(
                    "warning",
                    path,
                    (
                        f"{line_count} lines; review for single responsibility "
                        "before adding more logic"
                    ),
                )
            )
    return findings


def check_top_level_service_files() -> list[Finding]:
    findings: list[Finding] = []
    services_root = BACKEND_ROOT / "services"
    for path in sorted(services_root.glob("*_service.py")):
        if path in TOP_LEVEL_SERVICE_ALLOWLIST:
            continue
        findings.append(
            Finding(
                "warning",
                path,
                (
                    "top-level service file detected; prefer folder-as-module "
                    "for new growth"
                ),
            )
        )
    return findings


def check_implicit_service_imports(paths: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    marker = "from services import"
    for path in paths:
        if path in EXPLICIT_IMPORT_ALLOWLIST:
            continue
        text = path.read_text(encoding="utf-8")
        if marker in text:
            findings.append(
                Finding(
                    "warning",
                    path,
                    (
                        "uses 'from services import ...'; prefer explicit module "
                        "imports in production code"
                    ),
                )
            )
    return findings


def summarize(findings: list[Finding]) -> tuple[int, int, int]:
    warnings = sum(1 for f in findings if f.level == "warning")
    errors = sum(1 for f in findings if f.level == "error")
    critical = sum(1 for f in findings if f.level == "critical")
    return warnings, errors, critical


def main() -> int:
    parser = argparse.ArgumentParser(description="Run lightweight architecture checks.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail on warnings as well as errors/critical findings.",
    )
    args = parser.parse_args()

    files = iter_python_files()
    findings = []
    findings.extend(check_file_lengths(files))
    findings.extend(check_top_level_service_files())
    findings.extend(check_implicit_service_imports(files))
    findings.sort(key=lambda item: (item.level, str(item.path)))

    warnings, errors, critical = summarize(findings)

    print("Architecture Guard")
    print(f"- Scanned files: {len(files)}")
    print(f"- Warnings: {warnings}")
    print(f"- Errors: {errors}")
    print(f"- Critical: {critical}")

    if findings:
        print("\nFindings:")
        for finding in findings:
            print(f"- {finding.render()}")
    else:
        print("\nNo architecture drift detected.")

    if critical or errors:
        return 1
    if args.strict and warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
