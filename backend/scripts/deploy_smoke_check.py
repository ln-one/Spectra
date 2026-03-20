#!/usr/bin/env python3
"""Lightweight smoke checks for main-branch demo deployments."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class Check:
    name: str
    path: str
    requires_auth: bool = False


CHECKS = (
    Check("root-health", "/health"),
    Check("capabilities-health", "/api/v1/health/capabilities"),
    Check("generate-capabilities", "/api/v1/generate/capabilities", requires_auth=True),
)


def _request(base_url: str, check: Check, token: str | None) -> dict:
    request = urllib.request.Request(f"{base_url}{check.path}")
    request.add_header("Accept", "application/json")
    if check.requires_auth:
        request.add_header("Authorization", f"Bearer {token}")

    with urllib.request.urlopen(request, timeout=10) as response:
        payload = response.read().decode("utf-8")
        body = json.loads(payload) if payload else {}
        return {
            "status": response.status,
            "body": body,
        }


def _run_check(base_url: str, check: Check, token: str | None) -> tuple[bool, str]:
    if check.requires_auth and not token:
        return True, f"SKIP {check.name}: requires token"

    try:
        result = _request(base_url, check, token)
    except urllib.error.HTTPError as exc:
        return False, f"FAIL {check.name}: HTTP {exc.code}"
    except urllib.error.URLError as exc:
        return False, f"FAIL {check.name}: {exc.reason}"
    except Exception as exc:  # pragma: no cover - defensive CLI path
        return False, f"FAIL {check.name}: {exc}"

    if result["status"] != 200:
        return False, f"FAIL {check.name}: HTTP {result['status']}"

    return True, f"PASS {check.name}: HTTP 200"


def run_smoke_checks(
    *,
    base_url: str,
    token: str | None,
    checks: tuple[Check, ...] = CHECKS,
    run_check: Callable[[str, Check, str | None], tuple[bool, str]] = _run_check,
) -> tuple[list[str], int]:
    messages = [f"Deployment smoke check against {base_url}"]
    failures = 0
    for check in checks:
        ok, message = run_check(base_url, check, token)
        messages.append(message)
        if not ok:
            failures += 1
    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Service base URL, default: http://localhost:8000",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional bearer token for authenticated checks",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    messages, failures = run_smoke_checks(base_url=base_url, token=args.token)
    for message in messages:
        print(message)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
