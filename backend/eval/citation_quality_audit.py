"""
D-8.3 引用标注质量评测工具

核心指标：
1) citation_coverage_rate: 需要引用的回答中，是否提供了有效 <cite chunk_id="..."></cite>
2) misquote_rate: 引用 chunk_id 不在允许来源集合中的比例
3) paragraph_relevance_rate: 带引用段落与对应来源文本是否相关
4) empty_citation_rate: 空引用（缺失 chunk_id）的比例
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

_CITE_TAG_RE = re.compile(r"<cite\b([^>]*)></cite>", flags=re.IGNORECASE)
_ATTR_RE = re.compile(r'([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"')
_TOKEN_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]{2,}")


@dataclass
class CitationAuditMetrics:
    total_samples: int
    citation_coverage_rate: float
    misquote_rate: float
    paragraph_relevance_rate: float
    empty_citation_rate: float
    failed_coverage_ids: list[str]
    failed_misquote_ids: list[str]
    failed_relevance_ids: list[str]
    failed_empty_ids: list[str]

    def summary(self) -> str:
        failed_count = (
            len(self.failed_coverage_ids)
            + len(self.failed_misquote_ids)
            + len(self.failed_relevance_ids)
            + len(self.failed_empty_ids)
        )
        return (
            f"total={self.total_samples}, "
            f"coverage={self.citation_coverage_rate:.1%}, "
            f"misquote={self.misquote_rate:.1%}, "
            f"paragraph_relevance={self.paragraph_relevance_rate:.1%}, "
            f"empty={self.empty_citation_rate:.1%}, "
            f"failed={failed_count}"
        )


def _tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall((text or "").lower()))


def _parse_cite_tags(markdown: str) -> list[dict]:
    tags: list[dict] = []
    for match in _CITE_TAG_RE.finditer(markdown or ""):
        attr_text = match.group(1) or ""
        attrs = {k: v for k, v in _ATTR_RE.findall(attr_text)}
        tags.append(
            {
                "raw": match.group(0),
                "chunk_id": attrs.get("chunk_id", "").strip(),
                "attrs": attrs,
                "start": match.start(),
                "end": match.end(),
            }
        )
    return tags


def _extract_paragraph(markdown: str, start: int, end: int) -> str:
    text = markdown or ""
    prev_sep = text.rfind("\n\n", 0, start)
    next_sep = text.find("\n\n", end)
    left = prev_sep + 2 if prev_sep != -1 else 0
    right = next_sep if next_sep != -1 else len(text)
    paragraph = text[left:right]
    return _CITE_TAG_RE.sub("", paragraph).strip()


def compute_metrics(
    samples: list[dict], min_overlap_tokens: int = 1
) -> CitationAuditMetrics:
    if not samples:
        return CitationAuditMetrics(0, 0.0, 0.0, 0.0, 0.0, [], [], [], [])

    coverage_total = 0
    coverage_pass = 0

    misquote_total = 0
    misquote_count = 0

    relevance_total = 0
    relevance_pass = 0

    empty_total = 0
    empty_count = 0

    failed_coverage_ids: list[str] = []
    failed_misquote_ids: list[str] = []
    failed_relevance_ids: list[str] = []
    failed_empty_ids: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        markdown = str(sample.get("assistant_markdown", "") or "")
        expect_citation = bool(sample.get("expect_citation", False))

        tags = _parse_cite_tags(markdown)
        valid_chunk_ids = [t["chunk_id"] for t in tags if t["chunk_id"]]
        has_valid_cite = len(valid_chunk_ids) > 0

        if expect_citation:
            coverage_total += 1
            if has_valid_cite:
                coverage_pass += 1
            else:
                failed_coverage_ids.append(sample_id)

        empty_total += 1
        has_empty = any(not t["chunk_id"] for t in tags)
        if has_empty:
            empty_count += 1
            failed_empty_ids.append(sample_id)

        allowed_source_ids = set(sample.get("allowed_source_ids", []))
        if not allowed_source_ids:
            allowed_source_ids = {
                c.get("chunk_id")
                for c in sample.get("citations", [])
                if isinstance(c, dict) and c.get("chunk_id")
            }
        misquote_total += 1
        has_misquote = any(
            chunk_id not in allowed_source_ids for chunk_id in valid_chunk_ids
        )
        if has_misquote:
            misquote_count += 1
            failed_misquote_ids.append(sample_id)

        source_map = sample.get("source_map", {}) or {}
        paragraph_checks = 0
        paragraph_hits = 0
        for tag in tags:
            chunk_id = tag.get("chunk_id")
            if not chunk_id:
                continue
            source_text = str(source_map.get(chunk_id, "") or "")
            if not source_text:
                continue
            paragraph_text = _extract_paragraph(markdown, tag["start"], tag["end"])
            paragraph_checks += 1
            overlap = _tokenize(paragraph_text) & _tokenize(source_text)
            if len(overlap) >= min_overlap_tokens:
                paragraph_hits += 1
        if paragraph_checks > 0:
            relevance_total += 1
            if paragraph_hits == paragraph_checks:
                relevance_pass += 1
            else:
                failed_relevance_ids.append(sample_id)

    coverage_rate = coverage_pass / coverage_total if coverage_total > 0 else 0.0
    misquote_rate = misquote_count / misquote_total if misquote_total > 0 else 0.0
    relevance_rate = relevance_pass / relevance_total if relevance_total > 0 else 0.0
    empty_rate = empty_count / empty_total if empty_total > 0 else 0.0

    return CitationAuditMetrics(
        total_samples=len(samples),
        citation_coverage_rate=coverage_rate,
        misquote_rate=misquote_rate,
        paragraph_relevance_rate=relevance_rate,
        empty_citation_rate=empty_rate,
        failed_coverage_ids=failed_coverage_ids,
        failed_misquote_ids=failed_misquote_ids,
        failed_relevance_ids=failed_relevance_ids,
        failed_empty_ids=failed_empty_ids,
    )


def run_audit(
    dataset_path: Path,
    output_path: Path | None = None,
    min_overlap_tokens: int = 1,
) -> CitationAuditMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_metrics(samples, min_overlap_tokens=min_overlap_tokens)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "citation_coverage_rate": metrics.citation_coverage_rate,
                "misquote_rate": metrics.misquote_rate,
                "paragraph_relevance_rate": metrics.paragraph_relevance_rate,
                "empty_citation_rate": metrics.empty_citation_rate,
                "failed_coverage_ids": metrics.failed_coverage_ids,
                "failed_misquote_ids": metrics.failed_misquote_ids,
                "failed_relevance_ids": metrics.failed_relevance_ids,
                "failed_empty_ids": metrics.failed_empty_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D-8.3 引用标注质量评测")
    parser.add_argument(
        "--dataset",
        default="eval/citation_audit_samples.json",
        help="评测样本路径",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="评测结果输出路径（可选）",
    )
    parser.add_argument(
        "--min-overlap-tokens",
        type=int,
        default=1,
        help="段落与来源相关性最小重合 token 数",
    )
    args = parser.parse_args()

    metrics = run_audit(
        dataset_path=Path(args.dataset),
        output_path=Path(args.output) if args.output else None,
        min_overlap_tokens=args.min_overlap_tokens,
    )
    print(metrics.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
