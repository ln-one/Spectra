"""
Bootstrap real project/indexed data for D-5.1 validation.

Flow:
1) Register (or login if user exists)
2) Create project
3) Upload one real file
4) Poll file status until ready/failed
5) Verify ParsedChunk state and remote retrieval readiness hints locally
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx


def _now_tag() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a real project and indexed data via API."
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Backend base url, default: http://127.0.0.1:8000",
    )
    parser.add_argument(
        "--email",
        default=f"d5.baseline.{_now_tag()}@example.com",
        help="Login email. If new, script will register first.",
    )
    parser.add_argument(
        "--password",
        default="SpectraD5Baseline!2026",
        help="Login password (must satisfy backend constraints).",
    )
    parser.add_argument(
        "--username",
        default=f"d5_runner_{int(time.time())}",
        help="Username used for register.",
    )
    parser.add_argument(
        "--project-name",
        default=f"D5 Real Baseline {_now_tag()}",
        help="Project name to create.",
    )
    parser.add_argument(
        "--project-description",
        default="Auto-created for D-5.1 real project/indexing baseline.",
        help="Project description.",
    )
    parser.add_argument(
        "--file",
        required=True,
        help="Path to a real local file for upload (pdf/docx/pptx/txt/md/mp4...).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=120,
        help="Polling timeout seconds for upload/index status.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=2.0,
        help="Polling interval seconds.",
    )
    parser.add_argument(
        "--skip-local-verify",
        action="store_true",
        help="Skip local runtime verification after upload/index smoke completes.",
    )
    return parser


def _safe_json(resp: httpx.Response) -> dict[str, Any]:
    try:
        return resp.json()
    except Exception:
        return {"raw_text": resp.text}


def _raise_for_status(resp: httpx.Response, action: str) -> None:
    if 200 <= resp.status_code < 300:
        return
    payload = _safe_json(resp)
    raise RuntimeError(
        f"{action} failed: status={resp.status_code}, "
        f"payload={json.dumps(payload, ensure_ascii=False)}"
    )


def _register_or_login(
    client: httpx.Client, base_url: str, email: str, password: str, username: str
) -> None:
    register_payload = {
        "email": email,
        "password": password,
        "username": username,
        "fullName": "D5 Baseline Runner",
    }
    register = client.post(f"{base_url}/auth/register", json=register_payload)
    if register.status_code in (200, 201):
        return

    if register.status_code not in (400, 409):
        _raise_for_status(register, "register")

    login_payload = {"email": email, "password": password}
    login = client.post(f"{base_url}/auth/login", json=login_payload)
    _raise_for_status(login, "login")
    return


def _create_project(
    client: httpx.Client,
    base_url: str,
    project_name: str,
    description: str,
) -> str:
    payload = {
        "name": project_name,
        "description": description,
        "grade_level": "高中",
    }
    resp = client.post(
        f"{base_url}/projects",
        json=payload,
    )
    _raise_for_status(resp, "create project")
    return resp.json()["data"]["project"]["id"]


def _upload_file(
    client: httpx.Client,
    base_url: str,
    project_id: str,
    file_path: Path,
) -> tuple[str, str]:
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f"file not found: {file_path}")

    with file_path.open("rb") as f:
        files = {"file": (file_path.name, f, "application/octet-stream")}
        data = {"project_id": project_id}
        resp = client.post(
            f"{base_url}/files",
            files=files,
            data=data,
        )
    _raise_for_status(resp, "upload file")
    payload = resp.json()
    file_data = payload["data"]["file"]
    return file_data["id"], file_data.get("status") or ""


def _poll_file_status(
    client: httpx.Client,
    base_url: str,
    project_id: str,
    file_id: str,
    timeout_seconds: int,
    poll_interval: float,
) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    last: Optional[dict[str, Any]] = None
    while time.time() < deadline:
        resp = client.get(
            f"{base_url}/projects/{project_id}/files",
            params={"page": 1, "limit": 100},
        )
        _raise_for_status(resp, "query project files")
        files = resp.json().get("data", {}).get("files", [])
        target = next((x for x in files if x.get("id") == file_id), None)
        if target:
            last = target
            status = (target.get("status") or "").lower()
            if status in {"ready", "failed"}:
                return target
        time.sleep(poll_interval)
    if last is not None:
        return last
    raise TimeoutError("poll timeout: target file not found in project files list")


def _local_verify(repo_root: Path, project_id: str) -> dict[str, Any]:
    del repo_root, project_id
    result: dict[str, Any] = {
        "db_path": "n/a-postgresql",
        "project_exists": "n/a-postgresql",
        "upload_ready": "n/a-postgresql",
        "parsed_chunk_count_for_file": "n/a-postgresql",
        "parsed_chunk_count_for_project": "n/a-postgresql",
        "stratumind_project_index": "n/a-remote-service",
    }
    return result


def main() -> int:
    args = _build_parser().parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    file_path = Path(args.file).expanduser().resolve()

    with httpx.Client(timeout=30.0) as client:
        _register_or_login(
            client=client,
            base_url=args.base_url.rstrip("/"),
            email=args.email,
            password=args.password,
            username=args.username,
        )
        project_id = _create_project(
            client=client,
            base_url=args.base_url.rstrip("/"),
            project_name=args.project_name,
            description=args.project_description,
        )
        file_id, initial_status = _upload_file(
            client=client,
            base_url=args.base_url.rstrip("/"),
            project_id=project_id,
            file_path=file_path,
        )
        final_file = _poll_file_status(
            client=client,
            base_url=args.base_url.rstrip("/"),
            project_id=project_id,
            file_id=file_id,
            timeout_seconds=args.timeout_seconds,
            poll_interval=args.poll_interval,
        )

    output: dict[str, Any] = {
        "success": (final_file.get("status") or "").lower() == "ready",
        "base_url": args.base_url.rstrip("/"),
        "project_id": project_id,
        "file_id": file_id,
        "initial_file_status": initial_status,
        "final_file_status": final_file.get("status"),
        "file_name": final_file.get("filename"),
        "parse_error": final_file.get("parse_error"),
        "parse_details": final_file.get("parse_details"),
    }

    if not args.skip_local_verify:
        output["local_verify"] = _local_verify(
            repo_root=repo_root,
            project_id=project_id,
        )

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if output["success"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        raise
