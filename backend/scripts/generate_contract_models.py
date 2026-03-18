"""
Generate backend schema models from OpenAPI target contract.

Usage:
  python scripts/generate_contract_models.py
  python scripts/generate_contract_models.py --check
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = BACKEND_ROOT.parent

_default_input = WORKSPACE_ROOT / "docs" / "openapi-target.yaml"
if not _default_input.exists():
    _default_input = BACKEND_ROOT / "docs" / "openapi-target.yaml"

DEFAULT_INPUT = _default_input
DEFAULT_OUTPUT = BACKEND_ROOT / "schemas" / "generated.py"


def _build_command(input_path: Path, output_path: Path) -> list[str]:
    return [
        "datamodel-codegen",
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--input-file-type",
        "openapi",
        "--output-model-type",
        "pydantic_v2.BaseModel",
        "--disable-timestamp",
    ]


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    output_before = _read_text(args.output)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    command = _build_command(args.input, args.output)
    try:
        subprocess.run(command, check=True, cwd=BACKEND_ROOT)
    except FileNotFoundError:
        print(
            "datamodel-codegen not found. "
            "Install with: pip install datamodel-code-generator",
            file=sys.stderr,
        )
        return 2
    except subprocess.CalledProcessError as exc:
        print(f"generation failed: {exc}", file=sys.stderr)
        return 1

    if args.check:
        output_after = _read_text(args.output)
        if output_before != output_after:
            print(
                "generated models changed. please commit updated schemas/generated.py"
            )
            return 3
        print("generated models are up to date")
        return 0

    print(f"generated: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
