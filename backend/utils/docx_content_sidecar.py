from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def build_docx_content_sidecar_path(storage_path: str) -> Path:
    docx_path = Path(storage_path)
    return docx_path.with_suffix(f"{docx_path.suffix}.content.json")


def write_docx_content_sidecar(storage_path: str, content: dict[str, Any]) -> None:
    sidecar_path = build_docx_content_sidecar_path(storage_path)
    sidecar_path.write_text(
        json.dumps(content, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_docx_content_sidecar(storage_path: str) -> dict[str, Any]:
    sidecar_path = build_docx_content_sidecar_path(storage_path)
    if not sidecar_path.exists():
        return {}
    try:
        data = json.loads(sidecar_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}
