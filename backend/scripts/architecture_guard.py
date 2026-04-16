#!/usr/bin/env python3
"""Lightweight architecture guard for backend code structure.

This script is intentionally strict on hot-path drift:
- file length > 300 lines => warning
- file length > 500 lines => error
- file length > 800 lines => critical error
- new top-level ``*_service.py`` files under ``backend/services`` => warning
- production ``from services import ...`` usage => error

The goal is to surface architecture drift without blocking normal iteration on
healthy medium-sized files.
"""

from __future__ import annotations

import argparse
import re
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
    BACKEND_ROOT / "services" / "__init__.py",
}

TOP_LEVEL_SERVICE_ALLOWLIST = {
    BACKEND_ROOT / "services" / "auth_service.py",
}
IDENTITY_SERVICE_ROOT_FILE = BACKEND_ROOT / "services" / "identity_service.py"
RENDER_ADAPTER_HELPERS_ROOT = BACKEND_ROOT / "services" / "render_engine_adapter_helpers"
GENERATION_ROOT = BACKEND_ROOT / "services" / "generation"
OUTLINE_DRAFT_ROOT = BACKEND_ROOT / "services" / "generation_session_service" / "outline_draft"

SERVICE_BOUNDARIES_DOC = REPO_ROOT / "docs" / "architecture" / "service-boundaries.md"
REQUIRED_CAPABILITY_AUTHORITIES = {
    "diego",
    "pagevra",
    "ourograph",
    "dualweave",
    "stratumind",
    "limora",
}

LEGACY_RENDER_IMPORT_RE = re.compile(
    r"^\s*(from|import)\s+services\.generation\.(marp_generator|pandoc_generator|tool_checker)\b",
    re.MULTILINE,
)
LEGACY_OFFICE_IMPORT_RE = re.compile(
    r"^\s*(from|import)\s+services\.artifact_generator\.office\b",
    re.MULTILINE,
)
LEGACY_OFFICE_CALL_RE = re.compile(
    r"\bartifact_generator\.generate_(pptx|docx)\s*\(",
)
GENERATION_BACKEND_LANGUAGE_RE = re.compile(
    r"(课件生成服务|render pipeline 与 ai service|ppt/doc rendering service)",
    re.IGNORECASE,
)


@dataclass
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
        with path.open("r", encoding="utf-8") as handle:
            line_count = sum(1 for _ in handle)
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


def check_adapter_boundary_layout() -> list[Finding]:
    findings: list[Finding] = []
    parsing_file = RENDER_ADAPTER_HELPERS_ROOT / "parsing.py"
    if parsing_file.exists():
        with parsing_file.open("r", encoding="utf-8") as handle:
            line_count = sum(1 for _ in handle)
        if line_count > 200:
            findings.append(
                Finding(
                    "warning",
                    parsing_file,
                    (
                        "adapter parsing facade is regrowing; keep Pagevra "
                        "compatibility parsing split into small helper modules"
                    ),
                )
            )
    if IDENTITY_SERVICE_ROOT_FILE.exists():
        findings.append(
            Finding(
                "warning",
                IDENTITY_SERVICE_ROOT_FILE,
                (
                    "identity_service should stay folder-as-module; avoid "
                    "reintroducing a root-level identity service file"
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
                    "error",
                    path,
                    (
                        "uses 'from services import ...'; prefer explicit module "
                        "imports in production code"
                    ),
                )
            )
    return findings


def check_six_service_boundaries_doc() -> list[Finding]:
    if not SERVICE_BOUNDARIES_DOC.exists():
        return [
            Finding(
                "error",
                SERVICE_BOUNDARIES_DOC,
                "missing service boundary authority document",
            )
        ]

    text = SERVICE_BOUNDARIES_DOC.read_text(encoding="utf-8").lower()
    findings: list[Finding] = []
    missing = [
        name for name in sorted(REQUIRED_CAPABILITY_AUTHORITIES) if f"`{name}`" not in text
    ]
    if missing:
        findings.append(
            Finding(
                "error",
                SERVICE_BOUNDARIES_DOC,
                "missing formal capability authorities: " + ", ".join(missing),
            )
        )
    if "四个微服务" in text or "four external services" in text:
        findings.append(
            Finding(
                "error",
                SERVICE_BOUNDARIES_DOC,
                "still describes the architecture as four services",
            )
        )
    return findings


def check_legacy_render_authority(paths: list[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if LEGACY_OFFICE_IMPORT_RE.search(text) or LEGACY_OFFICE_CALL_RE.search(text):
            findings.append(
                Finding(
                    "error",
                    path,
                    "uses backend-local PPT/DOC office generation; route through Pagevra",
                )
            )
        if path.is_relative_to(GENERATION_ROOT):
            continue
        if LEGACY_RENDER_IMPORT_RE.search(text):
            findings.append(
                Finding(
                    "error",
                    path,
                    (
                        "imports backend-local Marp/Pandoc renderer tooling; "
                        "Diego/Pagevra are the formal generation/render authorities"
                    ),
                )
            )
    return findings


def check_residual_legacy_boundaries(paths: list[Path]) -> list[Finding]:
    findings: list[Finding] = []

    generation_files = [
        path for path in paths if path.is_relative_to(GENERATION_ROOT)
    ]
    allowed_generation_files = {
        GENERATION_ROOT / "__init__.py",
        GENERATION_ROOT / "marp_document.py",
        GENERATION_ROOT / "types.py",
    }
    for path in generation_files:
        if path not in allowed_generation_files:
            findings.append(
                Finding(
                    "warning",
                    path,
                    (
                        "generation/ should stay a tiny compatibility layer; "
                        "unexpected source file detected"
                    ),
                )
            )
        text = path.read_text(encoding="utf-8")
        if GENERATION_BACKEND_LANGUAGE_RE.search(text):
            findings.append(
                Finding(
                    "warning",
                    path,
                    (
                        "generation/ is drifting back toward generation/render "
                        "authority language; keep it compatibility-only"
                    ),
                )
            )

    outline_draft_files = []
    if OUTLINE_DRAFT_ROOT.exists():
        outline_draft_files = [
            path
            for path in OUTLINE_DRAFT_ROOT.rglob("*.py")
            if "__pycache__" not in path.parts
        ]
    for path in outline_draft_files:
        findings.append(
            Finding(
                "warning",
                path,
                (
                    "outline_draft source resurfaced; keep residual legacy "
                    "logic out of active primary paths"
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
    findings.extend(check_adapter_boundary_layout())
    findings.extend(check_implicit_service_imports(files))
    findings.extend(check_six_service_boundaries_doc())
    findings.extend(check_legacy_render_authority(files))
    findings.extend(check_residual_legacy_boundaries(files))
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
