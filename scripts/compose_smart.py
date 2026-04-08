#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BASE_FILES = ["docker-compose.yml"]


def submodule_initialized(name: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "submodule", "status", "--", name],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return False

    line = result.stdout.strip()
    if not line:
        return False

    status = line[0]
    if status == "-":
        return False

    return (ROOT / name / ".git").exists()


def build_compose_command(argv: list[str]) -> list[str]:
    overrides: list[str] = []

    if submodule_initialized("pagevra"):
        print("[compose-smart] Detected local Pagevra source, enabling pagevra override.")
        overrides.append("docker-compose.pagevra.dev.yml")

    if submodule_initialized("dualweave"):
        print("[compose-smart] Detected local Dualweave source, enabling dualweave override.")
        overrides.append("docker-compose.dualweave.dev.yml")

    command = ["docker", "compose"]
    for compose_file in BASE_FILES:
        command.extend(["-f", compose_file])

    if not overrides:
        print("[compose-smart] No local private service source detected, using image-only compose.")
    else:
        print(
            "[compose-smart] Using compose overrides: "
            + " ".join(f"-f {name}" for name in overrides)
        )
        for compose_file in overrides:
            command.extend(["-f", compose_file])

    command.extend(argv)
    return command


def main() -> int:
    os.chdir(ROOT)
    command = build_compose_command(sys.argv[1:])
    completed = subprocess.run(command, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
