"""
来源质量抽样评测工具（D4 先行版）

基于现有字段做三类指标：
1) coverage_rate: 输出是否具备来源
2) readability_rate: 来源字段是否可读/可定位
3) relevance_rate: 输出文本与来源文本的关键词重合度

输入样本格式示例见 eval/source_audit_samples.json。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from schemas.common import SourceType, normalize_source_type


@dataclass
class AuditMetrics:
    total_samples: int
    coverage_rate: float
    readability_rate: float
    relevance_rate: float
    failed_sample_ids: list[str]
    by_retrieval_mode: dict[str, dict]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"coverage={self.coverage_rate:.1%}, "
            f"readability={self.readability_rate:.1%}, "
            f"relevance={self.relevance_rate:.1%}, "
            f"failed={len(self.failed_sample_ids)}, "
            f"modes={','.join(sorted(self.by_retrieval_mode.keys())) or 'none'}"
        )


def _tokenize(text: str) -> set[str]:
    words = re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,}", text.lower())
    return set(words)


def _has_locator(source: dict) -> bool:
    source_type = normalize_source_type(source.get("source_type"))
    page = source.get("page_number")
    ts = source.get("timestamp")

    if source_type == SourceType.DOCUMENT.value:
        return page is not None
    if source_type in {SourceType.VIDEO.value, SourceType.AUDIO.value}:
        return ts is not None
    return page is not None or ts is not None


def _is_readable_source(source: dict) -> bool:
    required = ["chunk_id", "source_type", "filename"]
    if any(not source.get(k) for k in required):
        return False
    return _has_locator(source)


def _extract_sources(sample: dict) -> list[dict]:
    preview_sources = sample.get("preview_sources") or []
    if preview_sources:
        return preview_sources

    rag_results = sample.get("rag_results") or []
    return [r.get("source", {}) for r in rag_results if isinstance(r, dict)]


def _extract_source_texts(sample: dict) -> list[str]:
    texts: list[str] = []

    for r in sample.get("rag_results") or []:
        content = r.get("content")
        if content:
            texts.append(content)
        source = r.get("source") or {}
        preview = source.get("preview_text")
        if preview:
            texts.append(preview)

    for d in sample.get("source_details") or []:
        content = d.get("content")
        if content:
            texts.append(content)

    return texts


def _sample_has_relevance(sample: dict, min_overlap_tokens: int = 1) -> bool:
    output_text = sample.get("output_text", "")
    if not output_text:
        return False

    output_tokens = _tokenize(output_text)
    if not output_tokens:
        return False

    source_texts = _extract_source_texts(sample)
    if not source_texts:
        return False

    for src in source_texts:
        overlap = output_tokens & _tokenize(src)
        if len(overlap) >= min_overlap_tokens:
            return True
    return False


def compute_audit_metrics(samples: list[dict]) -> AuditMetrics:
    if not samples:
        return AuditMetrics(0, 0.0, 0.0, 0.0, [], {})

    covered = 0
    readable = 0
    relevant = 0
    failed_ids: list[str] = []

    for idx, sample in enumerate(samples):
        sample_id = sample.get("id", f"sample-{idx+1}")
        sources = _extract_sources(sample)

        has_coverage = len(sources) > 0
        if has_coverage:
            covered += 1

        has_readability = has_coverage and all(_is_readable_source(s) for s in sources)
        if has_readability:
            readable += 1

        has_relevance = _sample_has_relevance(sample)
        if has_relevance:
            relevant += 1

        if not (has_coverage and has_readability and has_relevance):
            failed_ids.append(sample_id)

    total = len(samples)
    by_retrieval_mode: dict[str, dict] = {}
    grouped_samples: dict[str, list[dict]] = {}
    for sample in samples:
        mode = str(sample.get("retrieval_mode") or "unspecified")
        grouped_samples.setdefault(mode, []).append(sample)

    for mode, grouped in grouped_samples.items():
        covered_mode = 0
        readable_mode = 0
        relevant_mode = 0
        failed_mode: list[str] = []

        for idx, sample in enumerate(grouped):
            sample_id = sample.get("id", f"{mode}-sample-{idx+1}")
            sources = _extract_sources(sample)

            has_coverage = len(sources) > 0
            if has_coverage:
                covered_mode += 1

            has_readability = has_coverage and all(
                _is_readable_source(s) for s in sources
            )
            if has_readability:
                readable_mode += 1

            has_relevance = _sample_has_relevance(sample)
            if has_relevance:
                relevant_mode += 1

            if not (has_coverage and has_readability and has_relevance):
                failed_mode.append(sample_id)

        mode_total = len(grouped)
        by_retrieval_mode[mode] = {
            "total_samples": mode_total,
            "coverage_rate": covered_mode / mode_total,
            "readability_rate": readable_mode / mode_total,
            "relevance_rate": relevant_mode / mode_total,
            "failed_sample_ids": failed_mode,
        }

    return AuditMetrics(
        total_samples=total,
        coverage_rate=covered / total,
        readability_rate=readable / total,
        relevance_rate=relevant / total,
        failed_sample_ids=failed_ids,
        by_retrieval_mode=by_retrieval_mode,
    )


def run_audit(dataset_path: Path, output_path: Path | None = None) -> AuditMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_audit_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "coverage_rate": metrics.coverage_rate,
                "readability_rate": metrics.readability_rate,
                "relevance_rate": metrics.relevance_rate,
                "failed_sample_ids": metrics.failed_sample_ids,
                "by_retrieval_mode": metrics.by_retrieval_mode,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="来源质量抽样评测")
    parser.add_argument(
        "--dataset",
        default="eval/source_audit_samples.json",
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
