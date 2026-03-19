#!/usr/bin/env python3
"""Generate a lightweight incident record template for deploy/runtime failures."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "docs" / "incident-records" / "latest-incident.md"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a markdown incident record template."
    )
    parser.add_argument("--title", default="Untitled incident")
    parser.add_argument("--severity", default="SEV-3")
    parser.add_argument("--detected-at", default=iso_now())
    parser.add_argument("--owner", default="unknown")
    parser.add_argument(
        "--impact",
        default="Describe affected user flow, systems, and scope.",
    )
    parser.add_argument(
        "--summary",
        default="Describe what happened and the immediate symptom.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Output file path. Use '-' to print to stdout only.",
    )
    return parser.parse_args()


def build_markdown(args: argparse.Namespace) -> str:
    lines = [
        "# Incident Record",
        "",
        f"- title: `{args.title}`",
        f"- severity: `{args.severity}`",
        f"- detected_at_utc: `{args.detected_at}`",
        f"- owner: `{args.owner}`",
        "",
        "## Summary",
        "",
        args.summary,
        "",
        "## Impact",
        "",
        args.impact,
        "",
        "## Immediate Actions",
        "",
        "- TODO: list the first restore / mitigation actions taken.",
        "",
        "## Timeline",
        "",
        f"- `{args.detected_at}` detected",
        "- `TODO` mitigation started",
        "- `TODO` service restored",
        "",
        "## Root Cause Hypothesis",
        "",
        "- TODO: backend / worker / db / provider / deploy / env / queue / retrieval.",
        "",
        "## Evidence",
        "",
        "- TODO: logs, failing endpoint, container status, smoke check result.",
        "",
        "## Follow-up",
        "",
        "- TODO: code fix",
        "- TODO: runbook/doc update",
        "- TODO: regression test or alerting improvement",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    markdown = build_markdown(args)
    if args.output == "-":
        print(markdown)
        return 0

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown + "\n", encoding="utf-8")
    print(f"Wrote incident record to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
