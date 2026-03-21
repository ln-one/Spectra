#!/usr/bin/env python3
"""Run a standard deployment smoke pipeline in one command."""

from __future__ import annotations

import argparse
import shlex
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def build_pipeline_commands(
    *,
    skip_network_preflight: bool,
    base_url: str,
    token: str | None = None,
) -> list[list[str]]:
    commands: list[list[str]] = [
        ["python3", "backend/scripts/deploy_preflight.py"]
        + (["--skip-network"] if skip_network_preflight else []),
        ["python3", "backend/scripts/docker_deploy_readiness_audit.py"],
        ["python3", "backend/scripts/distributed_deploy_audit.py"],
        ["python3", "backend/scripts/deploy_smoke_check.py", "--base-url", base_url],
    ]
    if token:
        commands[-1].extend(["--token", token])
    return commands


def run_pipeline(commands: list[list[str]]) -> int:
    for idx, cmd in enumerate(commands, start=1):
        print(f"[{idx}/{len(commands)}] {' '.join(shlex.quote(p) for p in cmd)}")
        completed = subprocess.run(cmd, cwd=ROOT)
        if completed.returncode != 0:
            print(
                f"Pipeline stopped at step {idx} with exit code {completed.returncode}"
            )
            return completed.returncode
    print("Deployment smoke pipeline passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-network-preflight",
        action="store_true",
        help="skip TCP checks in preflight",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="API base URL for deploy_smoke_check",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="optional bearer token for authenticated smoke probe",
    )
    args = parser.parse_args()

    commands = build_pipeline_commands(
        skip_network_preflight=args.skip_network_preflight,
        base_url=args.base_url,
        token=args.token,
    )
    return run_pipeline(commands)


if __name__ == "__main__":
    raise SystemExit(main())
