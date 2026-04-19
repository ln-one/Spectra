"""Legacy structured adapter for invoking Pagevra `/render/*` endpoints.

This module remains as a compatibility layer for structured `document/page/block`
payloads. Diego-first mainline compile execution should prefer Pagevra
`/compile/bundles` and related artifact surfaces instead of routing back through
these structured endpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from services.render_engine_adapter_helpers.mapping import (
    build_render_engine_input as _build_render_engine_input,
)
from services.render_engine_adapter_helpers.mapping import (
    build_render_engine_page_input as _build_render_engine_page_input,
)
from services.render_engine_adapter_helpers.normalization import (
    normalize_render_engine_page_result as _normalize_render_engine_page_result,
)
from services.render_engine_adapter_helpers.normalization import (
    normalize_render_engine_result as _normalize_render_engine_result,
)
from services.runtime_env import normalize_internal_service_base_url, running_inside_container
from services.runtime_paths import get_generated_dir

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENGINE_ROOT = _REPO_ROOT / "pagevra"
_ENGINE_CLI = _ENGINE_ROOT / "src" / "cli.ts"


def _is_truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def render_engine_enabled() -> bool:
    return _is_truthy(os.getenv("PAGEVRA_ENABLED", "false"))


def _render_engine_node_bin() -> str:
    return os.getenv("PAGEVRA_NODE_BIN", "node").strip() or "node"


def _render_engine_base_url() -> str:
    return (
        normalize_internal_service_base_url(
            os.getenv("PAGEVRA_BASE_URL"),
            service_name="pagevra",
            inside_container=running_inside_container(),
            local_override=os.getenv("PAGEVRA_BASE_URL_LOCAL"),
        )
        or ""
    )


def _render_engine_timeout_seconds() -> float:
    raw = os.getenv("PAGEVRA_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 180.0
    try:
        return max(1.0, float(raw))
    except ValueError:
        logger.warning(
            "Invalid PAGEVRA_TIMEOUT_SECONDS=%r, falling back to 180s",
            raw,
        )
        return 180.0


def _render_engine_output_dir() -> Path:
    raw = os.getenv("PAGEVRA_OUTPUT_DIR", "").strip()
    if raw:
        return Path(raw)
    return get_generated_dir()


def build_render_engine_input(
    courseware_content,
    template_config: Optional[dict],
    output_targets: list[str],
    *,
    render_job_id: str,
) -> dict[str, Any]:
    """Build the legacy structured Pagevra `/render/jobs` payload."""
    return _build_render_engine_input(
        courseware_content,
        template_config,
        output_targets,
        render_job_id=render_job_id,
        output_dir=_render_engine_output_dir(),
    )


def build_render_engine_page_input(
    *,
    render_job_id: str,
    page_id: str,
    page_index: int,
    page_payload: dict[str, Any],
    document_title: str,
    template_config: Optional[dict],
    style_manifest: Optional[dict] = None,
    extra_css: Optional[str] = None,
    page_class_plan: Optional[list[dict]] = None,
    output_dir: Optional[str] = None,
) -> dict[str, Any]:
    """Build the legacy structured Pagevra `/render/pages` payload."""
    return _build_render_engine_page_input(
        render_job_id=render_job_id,
        page_id=page_id,
        page_index=page_index,
        page_payload=page_payload,
        document_title=document_title,
        template_config=template_config,
        output_dir=Path(output_dir) if output_dir else _render_engine_output_dir(),
        style_manifest=style_manifest,
        extra_css=extra_css,
        page_class_plan=page_class_plan,
    )


def normalize_render_engine_result(result: dict[str, Any]) -> dict[str, Any]:
    return _normalize_render_engine_result(result)


def normalize_render_engine_page_result(result: dict[str, Any]) -> dict[str, Any]:
    return _normalize_render_engine_page_result(result)


async def invoke_render_engine(render_input: dict[str, Any]) -> dict[str, Any]:
    """Invoke the legacy structured document render endpoint."""
    if not render_engine_enabled():
        raise RuntimeError("render_engine_disabled")
    base_url = _render_engine_base_url()
    if base_url:
        return await _invoke_render_engine_api(base_url, "/render/jobs", render_input)
    if not _ENGINE_CLI.exists():
        raise RuntimeError("render_engine_cli_missing")
    return await _invoke_render_engine_cli(render_input)


async def invoke_render_engine_page(render_input: dict[str, Any]) -> dict[str, Any]:
    """Invoke the legacy structured page preview endpoint."""
    if not render_engine_enabled():
        raise RuntimeError("render_engine_disabled")
    base_url = _render_engine_base_url()
    if not base_url:
        raise RuntimeError("render_engine_page_requires_api")
    return await _invoke_render_engine_api(base_url, "/render/pages", render_input)


async def _invoke_render_engine_api(
    base_url: str,
    endpoint: str,
    render_input: dict[str, Any],
) -> dict[str, Any]:
    payload = json.dumps(render_input, ensure_ascii=False).encode("utf-8")
    timeout_seconds = _render_engine_timeout_seconds()

    def _run() -> dict[str, Any]:
        request = urllib_request.Request(
            f"{base_url}{endpoint}",
            data=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(request, timeout=timeout_seconds) as response:
                response_text = response.read().decode("utf-8")
                status_code = response.getcode()
        except urllib_error.HTTPError as exc:
            response_text = exc.read().decode("utf-8", errors="replace")
            status_code = exc.code
        except urllib_error.URLError as exc:
            raise RuntimeError(f"render_engine_api_unreachable: {exc.reason}") from exc
        except TimeoutError as exc:
            raise RuntimeError("render_engine_api_timeout") from exc

        try:
            payload_obj = json.loads(response_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "render_engine_api_invalid_json "
                f"status={status_code} body={response_text[:300]}"
            ) from exc
        if not isinstance(payload_obj, dict):
            raise RuntimeError("render_engine_invalid_payload")
        if status_code >= 400 or payload_obj.get("state") == "failed":
            raise RuntimeError(
                str(
                    payload_obj.get("error")
                    or payload_obj.get("state_reason")
                    or f"render_engine_api_failed status={status_code}"
                )
            )
        return payload_obj

    return await asyncio.to_thread(_run)


async def _invoke_render_engine_cli(render_input: dict[str, Any]) -> dict[str, Any]:
    payload = json.dumps(render_input, ensure_ascii=False)

    def _run() -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                _render_engine_node_bin(),
                "--experimental-strip-types",
                str(_ENGINE_CLI),
            ],
            cwd=str(_REPO_ROOT),
            input=payload,
            text=True,
            capture_output=True,
            check=False,
        )

    result = await asyncio.to_thread(_run)
    stdout = result.stdout.strip()
    if not stdout:
        raise RuntimeError(
            "render_engine_empty_output "
            f"code={result.returncode} stderr={result.stderr.strip()}"
        )
    try:
        payload_obj = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"render_engine_invalid_json code={result.returncode} stdout={stdout[:300]}"
        ) from exc

    if not isinstance(payload_obj, dict):
        raise RuntimeError("render_engine_invalid_payload")
    if result.returncode != 0 or payload_obj.get("state") == "failed":
        raise RuntimeError(
            str(
                payload_obj.get("error")
                or payload_obj.get("state_reason")
                or "render_failed"
            )
        )
    return payload_obj
