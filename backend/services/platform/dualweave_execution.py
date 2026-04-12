from __future__ import annotations

import os
from typing import Any, Optional

_SUPPORTED_REMOTE_PARSE_TYPES = {"pdf", "word", "ppt", "image"}
_ALIASES = {
    "document": "word",
    "doc": "word",
    "docx": "word",
    "txt": "word",
    "md": "word",
    "csv": "word",
    "presentation": "ppt",
    "pptx": "ppt",
}


def _getenv(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    raw = _getenv(name)
    if not raw:
        return default
    return int(raw)


def _get_int64(name: str, default: int) -> int:
    raw = _getenv(name)
    if not raw:
        return default
    return int(raw)


def _normalize_file_type(file_type: str) -> str:
    normalized = str(file_type or "").strip().lower()
    return _ALIASES.get(normalized, normalized or "pdf")


def dualweave_remote_parse_supported(file_type: str) -> bool:
    return _normalize_file_type(file_type) in _SUPPORTED_REMOTE_PARSE_TYPES


def build_dualweave_execution(file_type: str) -> Optional[dict[str, Any]]:
    normalized = _normalize_file_type(file_type)
    if normalized not in _SUPPORTED_REMOTE_PARSE_TYPES:
        return None
    if normalized == "image":
        return _build_image_execution()
    return _build_document_execution()


def _base_execution() -> dict[str, Any]:
    return {
        "chunk_size": _get_int("DUALWEAVE_EXECUTION_CHUNK_SIZE", 1024 * 1024),
        "local": {
            "kind": "localfs",
            "config": {
                "base_dir": _getenv("DUALWEAVE_EXECUTION_LOCAL_BASE_DIR", "./data"),
                "durability_mode": _getenv(
                    "DUALWEAVE_EXECUTION_LOCAL_DURABILITY_MODE", "sync_every_bytes"
                ),
                "sync_every_bytes": _get_int64(
                    "DUALWEAVE_EXECUTION_LOCAL_SYNC_EVERY_BYTES", 1024 * 1024
                ),
            },
        },
        "policy": {
            "routing": {
                "small_file_threshold_bytes": _get_int64(
                    "DUALWEAVE_EXECUTION_SMALL_FILE_THRESHOLD_BYTES", 2 * 1024 * 1024
                ),
                "inline_fast_path_enabled": _get_bool(
                    "DUALWEAVE_EXECUTION_INLINE_FAST_PATH_ENABLED", True
                ),
                "unknown_size_uses_spool": _get_bool(
                    "DUALWEAVE_EXECUTION_UNKNOWN_SIZE_USES_SPOOL", True
                ),
                "inline_remote_timeout": _getenv(
                    "DUALWEAVE_EXECUTION_INLINE_REMOTE_TIMEOUT", "250ms"
                ),
            },
            "spool": {
                "per_upload_backlog_cap_bytes": _get_int64(
                    "DUALWEAVE_EXECUTION_PER_UPLOAD_BACKLOG_CAP_BYTES",
                    96 * 1024 * 1024,
                ),
                "pending_remote_grace_period": _getenv(
                    "DUALWEAVE_EXECUTION_PENDING_REMOTE_GRACE_PERIOD", "100ms"
                ),
                "sender_retry_attempts": _get_int(
                    "DUALWEAVE_EXECUTION_SENDER_RETRY_ATTEMPTS", 2
                ),
            },
            "service": {
                "node_spool_capacity_cap_bytes": _get_int64(
                    "DUALWEAVE_EXECUTION_NODE_SPOOL_CAPACITY_CAP_BYTES",
                    256 * 1024 * 1024,
                ),
                "node_inline_fallback_threshold_bytes": _get_int64(
                    "DUALWEAVE_EXECUTION_NODE_INLINE_FALLBACK_THRESHOLD_BYTES",
                    115 * 1024 * 1024,
                ),
                "node_small_file_inline_grace_bytes": _get_int64(
                    "DUALWEAVE_EXECUTION_NODE_SMALL_FILE_INLINE_GRACE_BYTES",
                    32 * 1024 * 1024,
                ),
            },
            "artifacts": {
                "completed_retention": _getenv(
                    "DUALWEAVE_EXECUTION_COMPLETED_RETENTION", "0s"
                ),
                "terminal_failure_retention": _getenv(
                    "DUALWEAVE_EXECUTION_TERMINAL_FAILURE_RETENTION", "0s"
                ),
            },
        },
    }


def _build_document_execution() -> dict[str, Any]:
    base_url = _getenv("DUALWEAVE_DOCUMENT_BASE_URL", "https://mineru.net").rstrip("/")
    execution = _base_execution()
    execution["custom"] = {
        "kind": "brokered_http_upload",
        "config": {
            "label": _getenv("DUALWEAVE_DOCUMENT_LABEL", "document_parse_http"),
            "prepare": {
                "url": f"{base_url}/api/v4/file-urls/batch",
                "method": "POST",
                "json": {
                    "files": [
                        {
                            "name": "{filename}",
                            "data_id": "{upload_id}",
                        }
                    ],
                    "model_version": _getenv("DUALWEAVE_DOCUMENT_MODEL_VERSION", "vlm"),
                    "language": _getenv("DUALWEAVE_DOCUMENT_LANGUAGE", "ch"),
                    "enable_formula": _get_bool(
                        "DUALWEAVE_DOCUMENT_ENABLE_FORMULA", True
                    ),
                    "enable_table": _get_bool("DUALWEAVE_DOCUMENT_ENABLE_TABLE", True),
                    "is_ocr": _get_bool("DUALWEAVE_DOCUMENT_IS_OCR", False),
                },
                "mapping": {
                    "upload_url_path": _getenv(
                        "DUALWEAVE_DOCUMENT_PREPARE_UPLOAD_URL_PATH",
                        "data.file_urls.0",
                    ),
                    "delivery_id_path": _getenv(
                        "DUALWEAVE_DOCUMENT_PREPARE_DELIVERY_ID_PATH",
                        "data.batch_id",
                    ),
                    "metadata_paths": {
                        "job_id": _getenv(
                            "DUALWEAVE_DOCUMENT_PREPARE_JOB_ID_PATH", "data.batch_id"
                        ),
                        "batch_id": _getenv(
                            "DUALWEAVE_DOCUMENT_PREPARE_BATCH_ID_PATH",
                            "data.batch_id",
                        ),
                    },
                },
            },
            "upload": {
                "method": _getenv("DUALWEAVE_DOCUMENT_UPLOAD_METHOD", "PUT"),
            },
            "workflow": {
                "url": _getenv(
                    "DUALWEAVE_DOCUMENT_WORKFLOW_URL",
                    f"{base_url}/api/v4/extract-results/batch/{{job_id}}",
                ),
                "method": _getenv("DUALWEAVE_DOCUMENT_WORKFLOW_METHOD", "GET"),
            },
            "result": {
                "kind": "result/fetch_url",
                "config": {
                    "metadata_keys": [
                        "batch_id",
                        "file_name",
                        "state",
                        "data_id",
                    ]
                },
            },
            "auth": {
                "kind": "auth/header_token",
                "config": {
                    "header": _getenv(
                        "DUALWEAVE_DOCUMENT_AUTH_HEADER", "Authorization"
                    ),
                    "prefix": _getenv("DUALWEAVE_DOCUMENT_AUTH_PREFIX", "Bearer"),
                    "token_env": _getenv(
                        "DUALWEAVE_DOCUMENT_TOKEN_ENV", "MINERU_CLOUD_API_TOKEN"
                    ),
                },
            },
            "mapping": {
                "status_path": _getenv(
                    "DUALWEAVE_DOCUMENT_WORKFLOW_STATUS_PATH",
                    "data.extract_result.0.state",
                ),
                "result_url_path": _getenv(
                    "DUALWEAVE_DOCUMENT_WORKFLOW_RESULT_URL_PATH",
                    "data.extract_result.0.full_zip_url",
                ),
                "metadata_paths": {
                    "file_name": _getenv(
                        "DUALWEAVE_DOCUMENT_WORKFLOW_FILE_NAME_PATH",
                        "data.extract_result.0.file_name",
                    ),
                    "state": _getenv(
                        "DUALWEAVE_DOCUMENT_WORKFLOW_STATE_PATH",
                        "data.extract_result.0.state",
                    ),
                    "data_id": _getenv(
                        "DUALWEAVE_DOCUMENT_WORKFLOW_DATA_ID_PATH",
                        "data.extract_result.0.data_id",
                    ),
                },
                "status_map": {
                    "done": "succeeded",
                    "failed": "failed",
                    "running": "running",
                },
            },
            "workflow_options": {
                "poll_interval": _getenv("DUALWEAVE_DOCUMENT_POLL_INTERVAL", "3s"),
                "timeout": _getenv("DUALWEAVE_DOCUMENT_TIMEOUT", "10m"),
            },
        },
    }
    execution["workflow_options"] = {
        "poll_interval": _getenv("DUALWEAVE_DOCUMENT_POLL_INTERVAL", "3s"),
        "timeout": _getenv("DUALWEAVE_DOCUMENT_TIMEOUT", "10m"),
    }
    return execution


def _build_image_execution() -> dict[str, Any]:
    execution = _base_execution()
    execution["send"] = {
        "kind": "send/http_multipart",
        "config": {
            "url": _getenv(
                "DUALWEAVE_IMAGE_BASE_URL", "https://api.ocr.space/parse/image"
            ),
            "label": _getenv("DUALWEAVE_IMAGE_SEND_LABEL", "image_ocr_http"),
            "multipart": {
                "file_field_name": "file",
                "fields": {
                    "language": _getenv("DUALWEAVE_IMAGE_LANGUAGE", "chs"),
                    "isOverlayRequired": str(
                        _get_bool("DUALWEAVE_IMAGE_OVERLAY_REQUIRED", False)
                    ).lower(),
                    "OCREngine": _getenv("DUALWEAVE_IMAGE_OCR_ENGINE", "2"),
                    "isTable": str(
                        _get_bool("DUALWEAVE_IMAGE_IS_TABLE", False)
                    ).lower(),
                },
            },
        },
    }
    execution["workflow"] = {"kind": "workflow/immediate", "config": {}}
    execution["result"] = {
        "kind": "result/inline_json",
        "config": {
            "text_path": _getenv(
                "DUALWEAVE_IMAGE_RESULT_TEXT_PATH", "ParsedResults.0.ParsedText"
            ),
            "result_url_path": _getenv(
                "DUALWEAVE_IMAGE_RESULT_URL_PATH", "SearchablePDFURL"
            ),
            "metadata_paths": {
                "ocr_exit_code": _getenv(
                    "DUALWEAVE_IMAGE_METADATA_OCR_EXIT_CODE_PATH", "OCRExitCode"
                ),
                "is_errored_on_processing": _getenv(
                    "DUALWEAVE_IMAGE_METADATA_ERRORED_PATH",
                    "IsErroredOnProcessing",
                ),
                "searchable_pdf_url": _getenv(
                    "DUALWEAVE_IMAGE_METADATA_SEARCHABLE_PDF_URL_PATH",
                    "SearchablePDFURL",
                ),
            },
        },
    }
    execution["auth"] = {
        "kind": "auth/header_token",
        "config": {
            "header": _getenv("DUALWEAVE_IMAGE_AUTH_HEADER", "apikey"),
            "token_env": _getenv("DUALWEAVE_IMAGE_API_KEY_ENV", "OCRSPACE_API_KEY"),
        },
    }
    execution["workflow_options"] = {
        "poll_interval": _getenv("DUALWEAVE_IMAGE_POLL_INTERVAL", "3s"),
        "timeout": _getenv("DUALWEAVE_IMAGE_TIMEOUT", "10m"),
    }
    return execution
