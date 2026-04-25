#!/usr/bin/env python3
"""Scan and optionally repair suspicious historical source-index records."""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from dataclasses import dataclass, asdict
from typing import Any

from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from services.database import db_service  # noqa: E402
from services.file_upload_service.constants import UploadStatus  # noqa: E402
from services.media.rag_indexing import index_upload_file_for_rag  # noqa: E402

HTML_FRAGMENT_RE = re.compile(
    r"</(td|tr|th|table|tbody|thead)>\s*<(td|tr|th|table|tbody|thead)\b",
    re.IGNORECASE,
)
RELATIVE_IMAGE_REF_RE = re.compile(
    r"!\[[^\]]*]\((?!https?://)[^)]+\)|<img\b[^>]*\bsrc\s*=\s*['\"](?!https?://)[^'\"]+['\"]",
    re.IGNORECASE,
)
ARCHIVE_URL_KEYS = (
    "source_archive_url",
    "dualweave_result_url",
    "result_url",
    "full_zip_url",
)
ARCHIVE_URL_NESTED_KEYS = ("processing_artifact", "delivery_artifact", "dualweave")


@dataclass
class CandidateRecord:
    upload_id: str
    project_id: str
    filename: str
    reasons: list[str]
    dry_run: bool
    repaired: bool = False
    error: str | None = None


def _safe_parse_json_object(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        value = raw.strip()
        if not value:
            return {}
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _resolve_archive_url(parse_result: dict[str, Any]) -> str:
    for key in ARCHIVE_URL_KEYS:
        value = parse_result.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for key in ARCHIVE_URL_NESTED_KEYS:
        nested = parse_result.get(key)
        if not isinstance(nested, dict):
            continue
        for child_key in ARCHIVE_URL_KEYS:
            value = nested.get(child_key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _is_legacy_parse_result(parse_result: dict[str, Any]) -> bool:
    if not parse_result:
        return False
    modern_markers = (
        "provider_used",
        "capability_status",
        "stage_timings_ms",
        "source_archive_url",
        "dualweave_result_url",
        "full_zip_url",
        "result_url",
    )
    return not any(marker in parse_result for marker in modern_markers)


def _declares_images(parse_result: dict[str, Any], chunk_samples: list[str]) -> bool:
    images_extracted = parse_result.get("images_extracted")
    if isinstance(images_extracted, int) and images_extracted > 0:
        return True
    if isinstance(images_extracted, str):
        try:
            if int(images_extracted) > 0:
                return True
        except ValueError:
            pass

    sources = parse_result.get("sources")
    if isinstance(sources, list):
        for item in sources:
            if isinstance(item, dict):
                image = item.get("image_path") or item.get("image")
                if isinstance(image, str) and image.strip():
                    return True

    for sample in chunk_samples:
        if RELATIVE_IMAGE_REF_RE.search(sample):
            return True
    return False


def _contains_html_fragments(chunk_samples: list[str]) -> bool:
    return any(HTML_FRAGMENT_RE.search(sample) for sample in chunk_samples)


def _collect_reasons(parse_result: dict[str, Any], chunk_samples: list[str]) -> list[str]:
    reasons: list[str] = []
    if _contains_html_fragments(chunk_samples):
        reasons.append("html_fragment_chunk")

    if _declares_images(parse_result, chunk_samples) and not _resolve_archive_url(
        parse_result
    ):
        reasons.append("image_declared_without_archive_url")

    if _is_legacy_parse_result(parse_result):
        reasons.append("legacy_parse_result_shape")

    return reasons


async def _load_chunk_samples(upload_id: str, sample_size: int) -> list[str]:
    records = await db_service.db.parsedchunk.find_many(
        where={"uploadId": upload_id},
        order={"chunkIndex": "asc"},
        take=max(sample_size, 1),
        select={"content": True},
    )
    samples: list[str] = []
    for item in records:
        content = getattr(item, "content", None)
        if isinstance(content, str) and content.strip():
            samples.append(content)
    return samples


async def _scan_candidates(
    *,
    scan_limit: int,
    sample_size: int,
    project_id: str | None,
    file_id: str | None,
) -> list[CandidateRecord]:
    where: dict[str, Any] = {"status": UploadStatus.READY.value}
    if project_id:
        where["projectId"] = project_id
    if file_id:
        where["id"] = file_id

    uploads = await db_service.db.upload.find_many(
        where=where,
        order={"updatedAt": "desc"},
        take=max(scan_limit, 1),
    )

    candidates: list[CandidateRecord] = []
    for upload in uploads:
        upload_id = str(getattr(upload, "id", "") or "")
        if not upload_id:
            continue
        parse_result = _safe_parse_json_object(getattr(upload, "parseResult", None))
        chunk_samples = await _load_chunk_samples(upload_id, sample_size)
        reasons = _collect_reasons(parse_result, chunk_samples)
        if not reasons:
            continue
        candidates.append(
            CandidateRecord(
                upload_id=upload_id,
                project_id=str(getattr(upload, "projectId", "") or ""),
                filename=str(getattr(upload, "filename", "") or ""),
                reasons=reasons,
                dry_run=True,
            )
        )
    return candidates


async def _repair_upload(candidate: CandidateRecord) -> None:
    upload = await db_service.get_file(candidate.upload_id)
    if not upload:
        raise RuntimeError("upload_not_found")
    parse_result = await index_upload_file_for_rag(
        upload=upload,
        project_id=upload.projectId,
        reindex=True,
        db=db_service,
    )
    await db_service.update_upload_status(
        upload.id,
        status=UploadStatus.READY.value,
        parse_result=parse_result,
        error_message=None,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Repair historical source index anomalies."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply repairs. Default mode is dry-run.",
    )
    parser.add_argument(
        "--scan-limit",
        type=int,
        default=300,
        help="Maximum ready uploads to scan.",
    )
    parser.add_argument(
        "--max-repairs",
        type=int,
        default=100,
        help="Maximum candidate repairs to execute.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Batch size for repair execution.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=1.0,
        help="Sleep seconds between repair tasks for throttling.",
    )
    parser.add_argument(
        "--chunk-sample-size",
        type=int,
        default=8,
        help="Chunk sample count per upload for anomaly detection.",
    )
    parser.add_argument("--project-id", default=None, help="Optional project filter.")
    parser.add_argument("--file-id", default=None, help="Optional upload id filter.")
    return parser


async def _main_async(args: argparse.Namespace) -> int:
    await db_service.connect()
    try:
        candidates = await _scan_candidates(
            scan_limit=args.scan_limit,
            sample_size=args.chunk_sample_size,
            project_id=args.project_id,
            file_id=args.file_id,
        )

        for item in candidates:
            item.dry_run = not args.execute

        if not args.execute:
            output = {
                "dry_run": True,
                "scan_limit": args.scan_limit,
                "candidate_count": len(candidates),
                "candidates": [asdict(item) for item in candidates[: args.max_repairs]],
            }
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 0

        repair_targets = candidates[: max(args.max_repairs, 0)]
        completed = 0
        for offset in range(0, len(repair_targets), max(args.batch_size, 1)):
            batch = repair_targets[offset : offset + max(args.batch_size, 1)]
            for candidate in batch:
                try:
                    await _repair_upload(candidate)
                    candidate.repaired = True
                    completed += 1
                except Exception as exc:  # pragma: no cover - runtime branch
                    candidate.error = str(exc)
                await asyncio.sleep(max(args.sleep_seconds, 0.0))

        output = {
            "dry_run": False,
            "scan_limit": args.scan_limit,
            "candidate_count": len(candidates),
            "repair_target_count": len(repair_targets),
            "repaired_count": completed,
            "failed_count": len([x for x in repair_targets if x.error]),
            "candidates": [asdict(item) for item in repair_targets],
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    finally:
        await db_service.disconnect()


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    return asyncio.run(_main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
