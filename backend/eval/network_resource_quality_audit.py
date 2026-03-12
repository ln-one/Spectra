"""
D-8.6 网络资源质量评测工具。

验证网页/音频/视频进入知识处理链后的标准化质量与可引用性。
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

from services.network_resource_strategy import (
    audio_segments_to_units,
    prepare_web_knowledge_units,
    rank_units_by_relevance,
    video_segments_to_units,
)

_TOKEN_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]{2,}")


def _tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall((text or "").lower()))


@dataclass
class NetworkResourceMetrics:
    total_samples: int
    normalization_rate: float
    relevance_pass_rate: float
    low_quality_reject_rate: float
    citation_ready_rate: float
    failed_normalization_ids: list[str]
    failed_relevance_ids: list[str]
    failed_reject_ids: list[str]
    failed_citation_ids: list[str]

    def summary(self) -> str:
        failed = (
            len(self.failed_normalization_ids)
            + len(self.failed_relevance_ids)
            + len(self.failed_reject_ids)
            + len(self.failed_citation_ids)
        )
        return (
            f"total={self.total_samples}, "
            f"normalization={self.normalization_rate:.1%}, "
            f"relevance={self.relevance_pass_rate:.1%}, "
            f"reject={self.low_quality_reject_rate:.1%}, "
            f"citation={self.citation_ready_rate:.1%}, "
            f"failed={failed}"
        )


def _is_unit_normalized(unit: dict) -> bool:
    required = ["chunk_id", "source_type", "content", "citation"]
    if any(not unit.get(key) for key in required):
        return False
    if not isinstance(unit.get("metadata"), dict):
        return False
    return True


def _is_citation_ready(unit: dict) -> bool:
    citation = unit.get("citation") or {}
    required = ["chunk_id", "source_type", "filename"]
    if any(not citation.get(key) for key in required):
        return False
    source_type = citation.get("source_type")
    if source_type in {"audio", "video"}:
        return citation.get("timestamp") is not None
    return True


def _is_relevant(units: list[dict], query: str) -> bool:
    if not units:
        return False
    top_content = str(units[0].get("content", "") or "")
    query_tokens = _tokenize(query)
    if not query_tokens:
        return False
    top_tokens = _tokenize(top_content)
    if len(top_tokens & query_tokens) >= 1:
        return True
    top_lower = top_content.lower()
    fuzzy_hits = sum(1 for token in query_tokens if token and token in top_lower)
    return fuzzy_hits >= 1


def compute_metrics(samples: list[dict]) -> NetworkResourceMetrics:
    if not samples:
        return NetworkResourceMetrics(0, 0.0, 0.0, 0.0, 0.0, [], [], [], [])

    normalization_pass = 0
    relevance_pass = 0
    reject_pass = 0
    citation_pass = 0

    failed_normalization_ids: list[str] = []
    failed_relevance_ids: list[str] = []
    failed_reject_ids: list[str] = []
    failed_citation_ids: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        query = str(sample.get("query", "") or "")

        web_units = prepare_web_knowledge_units(
            resources=sample.get("web_resources", []) or [],
            query=query,
            min_quality=float(sample.get("min_quality", 0.45)),
            min_relevance=float(sample.get("min_relevance", 0.1)),
            top_k=int(sample.get("top_k", 8)),
        )
        audio_units = audio_segments_to_units(
            audio_id=str(sample.get("audio_id", sample_id)),
            filename=str(sample.get("audio_filename", "audio.wav")),
            segments=sample.get("audio_segments", []) or [],
            min_confidence=float(sample.get("audio_min_confidence", 0.35)),
        )
        video_units = video_segments_to_units(
            video_id=str(sample.get("video_id", sample_id)),
            filename=str(sample.get("video_filename", "video.mp4")),
            segments=sample.get("video_segments", []) or [],
            min_confidence=float(sample.get("video_min_confidence", 0.35)),
        )

        ranked = rank_units_by_relevance(
            units=web_units + audio_units + video_units,
            query=query,
            top_k=int(sample.get("rank_top_k", 12)),
        )

        if ranked and all(_is_unit_normalized(unit) for unit in ranked):
            normalization_pass += 1
        else:
            failed_normalization_ids.append(sample_id)

        if _is_relevant(ranked, query):
            relevance_pass += 1
        else:
            failed_relevance_ids.append(sample_id)

        expected_reject_ids = set(sample.get("expected_reject_resource_ids", []) or [])
        kept_resource_ids = {
            str((unit.get("metadata") or {}).get("resource_id"))
            for unit in ranked
            if (unit.get("metadata") or {}).get("resource_id") is not None
        }
        if expected_reject_ids and not expected_reject_ids.isdisjoint(
            kept_resource_ids
        ):
            failed_reject_ids.append(sample_id)
        else:
            reject_pass += 1

        if ranked and all(_is_citation_ready(unit) for unit in ranked):
            citation_pass += 1
        else:
            failed_citation_ids.append(sample_id)

    total = len(samples)
    return NetworkResourceMetrics(
        total_samples=total,
        normalization_rate=normalization_pass / total,
        relevance_pass_rate=relevance_pass / total,
        low_quality_reject_rate=reject_pass / total,
        citation_ready_rate=citation_pass / total,
        failed_normalization_ids=failed_normalization_ids,
        failed_relevance_ids=failed_relevance_ids,
        failed_reject_ids=failed_reject_ids,
        failed_citation_ids=failed_citation_ids,
    )


def run_audit(
    dataset_path: Path,
    output_path: Path | None = None,
) -> NetworkResourceMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "normalization_rate": metrics.normalization_rate,
                "relevance_pass_rate": metrics.relevance_pass_rate,
                "low_quality_reject_rate": metrics.low_quality_reject_rate,
                "citation_ready_rate": metrics.citation_ready_rate,
                "failed_normalization_ids": metrics.failed_normalization_ids,
                "failed_relevance_ids": metrics.failed_relevance_ids,
                "failed_reject_ids": metrics.failed_reject_ids,
                "failed_citation_ids": metrics.failed_citation_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D-8.6 网络资源质量评测")
    parser.add_argument(
        "--dataset",
        default="eval/network_resource_samples.json",
        help="评测样本路径",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="评测结果输出路径（可选）",
    )
    args = parser.parse_args()

    metrics = run_audit(
        dataset_path=Path(args.dataset),
        output_path=Path(args.output) if args.output else None,
    )
    print(metrics.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
