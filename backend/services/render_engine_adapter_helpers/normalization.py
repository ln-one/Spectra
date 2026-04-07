from __future__ import annotations


def normalize_render_engine_result(result: dict[str, object]) -> dict[str, object]:
    artifacts = result.get("artifacts") or {}
    metrics = result.get("metrics") or {}
    return {
        "artifact_paths": {
            artifact_type: path_value
            for artifact_type, path_value in {
                "pptx": (
                    artifacts.get("pptx_path") if isinstance(artifacts, dict) else None
                ),
                "docx": (
                    artifacts.get("docx_path") if isinstance(artifacts, dict) else None
                ),
            }.items()
            if isinstance(path_value, str) and path_value.strip()
        },
        "preview_pages": [
            item
            for item in (
                (
                    artifacts.get("preview_pages")
                    if isinstance(artifacts, dict)
                    else None
                )
                or []
            )
            if isinstance(item, str) and item.strip()
        ],
        "warnings": [
            warning
            for warning in (result.get("warnings") or [])
            if isinstance(warning, dict)
        ],
        "events": [
            event for event in (result.get("events") or []) if isinstance(event, dict)
        ],
        "metrics": metrics if isinstance(metrics, dict) else {},
    }


def normalize_render_engine_page_result(result: dict[str, object]) -> dict[str, object]:
    metrics = result.get("metrics") or {}
    return {
        "page_id": str(result.get("page_id") or "").strip(),
        "page_index": int(result.get("page_index") or 0),
        "html_preview": (
            result.get("html_preview")
            if isinstance(result.get("html_preview"), str)
            else None
        ),
        "preview_image_path": (
            result.get("preview_image_path")
            if isinstance(result.get("preview_image_path"), str)
            else None
        ),
        "warnings": [
            warning
            for warning in (result.get("warnings") or [])
            if isinstance(warning, dict)
        ],
        "events": [
            event for event in (result.get("events") or []) if isinstance(event, dict)
        ],
        "metrics": metrics if isinstance(metrics, dict) else {},
    }
