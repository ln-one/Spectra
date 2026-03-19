#!/usr/bin/env python3
"""Generate a lightweight deployment release record for main-branch rollouts."""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "docs" / "release-records" / "latest-release.md"


@dataclass(frozen=True)
class ReleaseFlags:
    schema_change: bool
    env_change: bool
    topology_change: bool


def run_git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def current_commit() -> str:
    return run_git("rev-parse", "HEAD")


def current_branch() -> str:
    return run_git("rev-parse", "--abbrev-ref", "HEAD")


def changed_files(commit: str) -> list[str]:
    return [
        line
        for line in run_git(
            "diff-tree", "--no-commit-id", "--name-only", "-r", commit
        ).splitlines()
        if line
    ]


def changed_categories(files: Iterable[str]) -> list[str]:
    categories: list[str] = []
    if any(path.startswith("backend/") for path in files):
        categories.append("backend")
    if any(path.startswith("frontend/") for path in files):
        categories.append("frontend")
    if any(path.startswith("docs/") for path in files):
        categories.append("docs")
    if any(path.startswith("backend/prisma/") for path in files):
        categories.append("database")
    return categories


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_markdown(
    *,
    commit: str,
    branch: str,
    operator: str,
    released_at: str,
    flags: ReleaseFlags,
    notes: str,
    files: list[str],
) -> str:
    categories = changed_categories(files)
    lines = [
        "# Release Record",
        "",
        f"- commit: `{commit}`",
        f"- branch: `{branch}`",
        f"- released_at_utc: `{released_at}`",
        f"- operator: `{operator}`",
        f"- change_scope: `{', '.join(categories) if categories else 'unknown'}`",
        f"- schema_change: `{'yes' if flags.schema_change else 'no'}`",
        f"- env_change: `{'yes' if flags.env_change else 'no'}`",
        f"- topology_change: `{'yes' if flags.topology_change else 'no'}`",
        "",
        "## Notes",
        "",
        notes or "- TODO: summarize user-visible impact and rollout risk.",
        "",
        "## Changed Files",
        "",
    ]
    if files:
        lines.extend(f"- `{path}`" for path in files)
    else:
        lines.append("- No changed files detected for this commit.")
    lines.extend(
        [
            "",
            "## Post-Deploy Checks",
            "",
            "- `python3 backend/scripts/deploy_preflight.py --skip-network`",
            (
                "- `python3 backend/scripts/deploy_smoke_check.py --base-url "
                "http://localhost:8000`"
            ),
            "- TODO: record whether authenticated generate capability check was run.",
            "",
            "## Rollback Reference",
            "",
            "- Previous stable commit: `TODO`",
            "- Rollback executed: `no`",
            "- Follow-up actions: `TODO`",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a markdown release record for a main-branch deployment."
    )
    parser.add_argument(
        "--commit", default=None, help="Commit to record. Defaults to HEAD."
    )
    parser.add_argument(
        "--operator", default="unknown", help="Deployment operator name."
    )
    parser.add_argument(
        "--released-at",
        default=iso_now(),
        help="Release timestamp in ISO-8601 UTC. Defaults to now.",
    )
    parser.add_argument(
        "--schema-change", action="store_true", help="Mark schema change."
    )
    parser.add_argument(
        "--env-change", action="store_true", help="Mark env contract change."
    )
    parser.add_argument(
        "--topology-change",
        action="store_true",
        help="Mark topology/deployment layout change.",
    )
    parser.add_argument(
        "--notes",
        default="",
        help="Short markdown note summarizing the rollout impact.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Output file path. Use '-' to print to stdout only.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    commit = args.commit or current_commit()
    branch = current_branch()
    files = changed_files(commit)
    markdown = build_markdown(
        commit=commit,
        branch=branch,
        operator=args.operator,
        released_at=args.released_at,
        flags=ReleaseFlags(
            schema_change=args.schema_change,
            env_change=args.env_change,
            topology_change=args.topology_change,
        ),
        notes=args.notes,
        files=files,
    )

    if args.output == "-":
        sys.stdout.write(markdown + "\n")
        return 0

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown + "\n", encoding="utf-8")
    print(f"Wrote release record to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
