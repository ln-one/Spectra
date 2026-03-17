"""
Bootstrap real project/indexed data for D-5.1 validation.

Flow:
1) Register (or login if user exists)
2) Create project
3) Upload one real file
4) Poll file status until ready/failed
5) Verify ParsedChunk + Chroma collection existence locally
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
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
        help="Skip sqlite/chroma local verification.",
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
        f"{action} failed: status={resp.status_code}, payload={json.dumps(payload, ensure_ascii=False)}"
    )


def _register_or_login(
    client: httpx.Client, base_url: str, email: str, password: str, username: str
) -> str:
    register_payload = {
        "email": email,
        "password": password,
        "username": username,
        "fullName": "D5 Baseline Runner",
    }
    register = client.post(f"{base_url}/auth/register", json=register_payload)
    if register.status_code in (200, 201):
        data = register.json()["data"]
        return data["access_token"]

    if register.status_code not in (400, 409):
        _raise_for_status(register, "register")

    login_payload = {"email": email, "password": password}
    login = client.post(f"{base_url}/auth/login", json=login_payload)
    _raise_for_status(login, "login")
    data = login.json()["data"]
    return data["access_token"]


def _create_project(
    client: httpx.Client,
    base_url: str,
    token: str,
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
        headers={"Authorization": f"Bearer {token}"},
    )
    _raise_for_status(resp, "create project")
    return resp.json()["data"]["project"]["id"]


def _upload_file(
    client: httpx.Client,
    base_url: str,
    token: str,
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
            headers={"Authorization": f"Bearer {token}"},
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
    token: str,
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
            headers={"Authorization": f"Bearer {token}"},
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


def _parse_database_url(env_path: Path) -> Optional[str]:
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue
        if raw.startswith("DATABASE_URL="):
            value = raw.split("=", 1)[1].strip().strip('"').strip("'")
            return value
    return None


def _resolve_db_candidates(repo_root: Path) -> list[Path]:
    backend_dir = repo_root / "backend"
    env_db = _parse_database_url(backend_dir / ".env")
    candidates: list[Path] = []
    if env_db and env_db.startswith("file:"):
        relative = env_db.removeprefix("file:").lstrip("./")
        candidates.append(backend_dir / relative)
        candidates.append((backend_dir / "prisma") / relative)
    candidates.extend(
        [
            backend_dir / "prisma" / "dev.db",
            backend_dir / "prisma" / "prisma" / "dev.db",
        ]
    )
    dedup: list[Path] = []
    seen = set()
    for path in candidates:
        key = str(path.resolve()) if path.exists() else str(path)
        if key in seen:
            continue
        seen.add(key)
        dedup.append(path)
    return dedup


def _choose_valid_db(db_candidates: list[Path]) -> Optional[Path]:
    for path in db_candidates:
        if not path.exists():
            continue
        try:
            conn = sqlite3.connect(path)
            cur = conn.cursor()
            exists = cur.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Project'"
            ).fetchone()[0]
            conn.close()
            if exists:
                return path
        except Exception:
            continue
    return None


def _resolve_chroma_sqlite(repo_root: Path) -> Optional[Path]:
    backend_dir = repo_root / "backend"
    chroma_dir = backend_dir / "chroma_data"
    env_path = backend_dir / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if raw.startswith("CHROMA_PERSIST_DIR="):
                value = raw.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    candidate = (backend_dir / value).resolve()
                    if candidate.is_dir():
                        sqlite_file = candidate / "chroma.sqlite3"
                        if sqlite_file.exists():
                            return sqlite_file
    default_file = chroma_dir / "chroma.sqlite3"
    if default_file.exists():
        return default_file
    root_file = repo_root / "chroma_data" / "chroma.sqlite3"
    if root_file.exists():
        return root_file
    return None


def _local_verify(repo_root: Path, project_id: str, file_id: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "db_path": None,
        "project_exists": None,
        "upload_ready": None,
        "parsed_chunk_count_for_file": None,
        "parsed_chunk_count_for_project": None,
        "chroma_path": None,
        "chroma_collection_exists": None,
    }

    db_path = _choose_valid_db(_resolve_db_candidates(repo_root))
    if db_path:
        result["db_path"] = str(db_path)
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        result["project_exists"] = bool(
            cur.execute(
                "SELECT COUNT(*) FROM Project WHERE id = ?", (project_id,)
            ).fetchone()[0]
        )
        result["upload_ready"] = bool(
            cur.execute(
                "SELECT COUNT(*) FROM Upload WHERE id = ? AND projectId = ? AND status = 'ready'",
                (file_id, project_id),
            ).fetchone()[0]
        )
        result["parsed_chunk_count_for_file"] = int(
            cur.execute(
                "SELECT COUNT(*) FROM ParsedChunk WHERE uploadId = ?",
                (file_id,),
            ).fetchone()[0]
        )
        result["parsed_chunk_count_for_project"] = int(
            cur.execute(
                """
                SELECT COUNT(*)
                FROM ParsedChunk pc
                JOIN Upload u ON u.id = pc.uploadId
                WHERE u.projectId = ?
                """,
                (project_id,),
            ).fetchone()[0]
        )
        conn.close()

    chroma_path = _resolve_chroma_sqlite(repo_root)
    if chroma_path:
        result["chroma_path"] = str(chroma_path)
        conn = sqlite3.connect(chroma_path)
        cur = conn.cursor()
        name = f"spectra_project_{project_id}"
        exists = cur.execute(
            "SELECT COUNT(*) FROM collections WHERE name = ?",
            (name,),
        ).fetchone()[0]
        result["chroma_collection_exists"] = bool(exists)
        conn.close()

    return result


def main() -> int:
    args = _build_parser().parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    file_path = Path(args.file).expanduser().resolve()

    with httpx.Client(timeout=30.0) as client:
        token = _register_or_login(
            client=client,
            base_url=args.base_url.rstrip("/"),
            email=args.email,
            password=args.password,
            username=args.username,
        )
        project_id = _create_project(
            client=client,
            base_url=args.base_url.rstrip("/"),
            token=token,
            project_name=args.project_name,
            description=args.project_description,
        )
        file_id, initial_status = _upload_file(
            client=client,
            base_url=args.base_url.rstrip("/"),
            token=token,
            project_id=project_id,
            file_path=file_path,
        )
        final_file = _poll_file_status(
            client=client,
            base_url=args.base_url.rstrip("/"),
            token=token,
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
            file_id=file_id,
        )

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if output["success"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        raise
