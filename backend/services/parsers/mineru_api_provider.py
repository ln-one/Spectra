"""
MinerU API provider.

Supports two configuration styles:
- `MINERU_API_URL=http://host:8000/parse` for a direct parse endpoint.
- `MINERU_API_URL=http://host:8000` for a FastAPI service root. In this mode
  the provider discovers the multipart upload endpoint from `/openapi.json`.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT_SECONDS = 120.0
_DISCOVERY_DOC_CANDIDATES = ("/openapi.json", "/docs/openapi.json")
_PREFERRED_ENDPOINT_KEYWORDS = ("parse", "file", "pdf", "extract")


def _extract_text_from_payload(payload: Any) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, list):
        parts = [_extract_text_from_payload(item) for item in payload]
        return "\n\n".join(part for part in parts if part)
    if not isinstance(payload, dict):
        return ""

    direct_keys = (
        "text",
        "markdown",
        "content",
        "full_text",
        "md_content",
        "parsed_text",
    )
    for key in direct_keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    nested_candidates = (
        payload.get("data"),
        payload.get("result"),
        payload.get("output"),
        payload.get("parsed"),
    )
    for nested in nested_candidates:
        text = _extract_text_from_payload(nested)
        if text:
            return text

    for list_key in ("documents", "pages", "chunks", "items"):
        value = payload.get(list_key)
        text = _extract_text_from_payload(value)
        if text:
            return text
    return ""


def _extract_page_count(payload: Any) -> int:
    if isinstance(payload, list):
        return len(payload) if payload else 0
    if not isinstance(payload, dict):
        return 0

    for key in ("pages_extracted", "pages", "page_count", "pageCount", "total_pages"):
        value = payload.get(key)
        if isinstance(value, int) and value >= 0:
            return value
        if isinstance(value, list):
            return len(value)

    for nested_key in ("data", "result", "output", "parsed"):
        nested = payload.get(nested_key)
        count = _extract_page_count(nested)
        if count > 0:
            return count
    return 0


def _normalize_root_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    path = parsed.path or ""
    if path.endswith("/docs"):
        path = path[: -len("/docs")] or "/"
    elif path.endswith("/openapi.json"):
        path = path[: -len("/openapi.json")] or "/"
    normalized_path = path.rstrip("/")
    rebuilt = parsed._replace(path=normalized_path, params="", query="", fragment="")
    return rebuilt.geturl().rstrip("/")


def _looks_like_explicit_endpoint(raw_url: str) -> bool:
    parsed = urlparse(raw_url)
    path = (parsed.path or "").rstrip("/")
    return bool(path and path not in {"", "/"} and not path.endswith("/docs"))


def _join_url(base_url: str, path: str) -> str:
    return urljoin(f"{base_url.rstrip('/')}/", path.lstrip("/"))


def _resolve_openapi_ref(document: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#/"):
        return None

    node: Any = document
    for segment in ref[2:].split("/"):
        if not isinstance(node, dict):
            return None
        node = node.get(segment)
        if node is None:
            return None
    return node


def _is_binary_multipart_endpoint(
    operation: dict[str, Any], openapi_document: dict[str, Any]
) -> bool:
    def _schema_contains_binary_file(schema: Any) -> bool:
        if not isinstance(schema, dict):
            return False

        ref = schema.get("$ref")
        if isinstance(ref, str):
            resolved = _resolve_openapi_ref(openapi_document, ref)
            if resolved is not None:
                return _schema_contains_binary_file(resolved)

        if schema.get("format") == "binary":
            return True

        items = schema.get("items")
        if _schema_contains_binary_file(items):
            return True

        properties = schema.get("properties") or {}
        return any(_schema_contains_binary_file(prop) for prop in properties.values())

    request_body = operation.get("requestBody") or {}
    content = request_body.get("content") or {}
    multipart_schema = (content.get("multipart/form-data") or {}).get("schema") or {}
    return _schema_contains_binary_file(multipart_schema)


def _rank_endpoint_path(path: str) -> tuple[int, int, str]:
    lowered = path.lower()
    keyword_score = sum(1 for item in _PREFERRED_ENDPOINT_KEYWORDS if item in lowered)
    return (-keyword_score, len(path), path)


def _discover_parse_path(client: httpx.Client, base_url: str) -> str:
    openapi_urls = [
        os.getenv("MINERU_API_OPENAPI_URL", "").strip(),
        *(_join_url(base_url, suffix) for suffix in _DISCOVERY_DOC_CANDIDATES),
    ]
    openapi_urls = [url for url in openapi_urls if url]

    last_error: str | None = None
    for openapi_url in openapi_urls:
        try:
            response = client.get(openapi_url)
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            last_error = str(exc).strip() or repr(exc)
            continue

        paths = payload.get("paths") or {}
        candidates: list[str] = []
        for path, methods in paths.items():
            if not isinstance(methods, dict):
                continue
            post_operation = methods.get("post")
            if isinstance(post_operation, dict) and _is_binary_multipart_endpoint(
                post_operation, payload
            ):
                candidates.append(path)
        if candidates:
            chosen = sorted(candidates, key=_rank_endpoint_path)[0]
            logger.info(
                "MinerU FastAPI endpoint discovered from %s: %s",
                openapi_url,
                chosen,
            )
            return chosen

    raise ProviderNotAvailableError(
        "Unable to discover MinerU FastAPI upload endpoint from OpenAPI. "
        f"base_url={base_url or '-'} last_error={last_error or 'none'}"
    )


class MineruApiProvider(BaseParseProvider):
    """MinerU remote API parser for PDF files."""

    name = "mineru_api"
    supported_types = {"pdf"}

    def __init__(self) -> None:
        raw_url = os.getenv("MINERU_API_URL", "").strip()
        if not raw_url:
            raise ProviderNotAvailableError(
                "MINERU_API_URL is not configured. Set it to a MinerU FastAPI base URL "
                "or a direct parse endpoint."
            )

        self.api_key = os.getenv("MINERU_API_KEY", "").strip()
        self.timeout_seconds = float(
            os.getenv("MINERU_API_TIMEOUT_SECONDS", str(_DEFAULT_TIMEOUT_SECONDS))
        )
        self.file_field = os.getenv("MINERU_API_FILE_FIELD", "file").strip() or "file"
        self.file_type_field = (
            os.getenv("MINERU_API_FILE_TYPE_FIELD", "file_type").strip() or "file_type"
        )

        self.root_url = _normalize_root_url(raw_url)
        if _looks_like_explicit_endpoint(raw_url):
            self.parse_url = raw_url
        else:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                self.parse_url = _join_url(
                    self.root_url, _discover_parse_path(client, self.root_url)
                )

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        details: dict[str, Any] = {"pages_extracted": 0, "text_length": 0}
        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            with open(filepath, "rb") as stream:
                files = {
                    self.file_field: (filename, stream, "application/octet-stream"),
                }
                data = {self.file_type_field: file_type}
                response = httpx.post(
                    self.parse_url,
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=self.timeout_seconds,
                )

            response.raise_for_status()
            payload = response.json()
            text = _extract_text_from_payload(payload)
            details["pages_extracted"] = _extract_page_count(payload)
            details["text_length"] = len(text)

            if text:
                details["provider_error"] = None
                details["provider_error_type"] = None
                logger.info(
                    "MinerU API parsed %s successfully via %s: pages=%d text_length=%d",
                    filename,
                    self.parse_url,
                    details["pages_extracted"],
                    details["text_length"],
                )
                return text, details

            details["provider_error"] = "empty_output"
            details["provider_error_type"] = "empty_output"
            logger.warning(
                "MinerU API returned empty content for %s via %s",
                filename,
                self.parse_url,
            )
            return "", details
        except Exception as exc:
            raw_error = str(exc).strip()
            details["provider_error"] = (
                raw_error if raw_error else "mineru_api_exception_without_message"
            )
            details["provider_error_type"] = "upstream_exception"
            details["provider_raw_error"] = raw_error
            logger.error(
                "MinerU API failed for %s via %s: %s",
                filename,
                self.parse_url,
                exc,
                exc_info=True,
            )
            return "", details
