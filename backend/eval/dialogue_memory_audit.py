"""
D6 对话资料记忆质量评测工具

核心指标：
1) hit_rate: 有参考资料问题中，回答是否命中期望来源
2) misquote_rate: 引用了不应引用的来源比例
3) no_hit_notice_rate: 无可用资料时，是否明确提示“未命中资料”
4) contract_consistency_rate: message/content/citations/rag_hit/observability 语义一致率
5) session_isolation_rate: source_session_ids 是否严格位于当前 session 作用域
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

_CITE_TAG_RE = re.compile(r'<cite\s+[^>]*chunk_id="([^"]+)"[^>]*>(?:\s*</cite>)?')


@dataclass
class DialogueMemoryMetrics:
    total_samples: int
    hit_rate: float
    misquote_rate: float
    no_hit_notice_rate: float
    contract_consistency_rate: float
    session_isolation_rate: float
    gate_passed: bool
    failed_hit_ids: list[str]
    failed_misquote_ids: list[str]
    failed_notice_ids: list[str]
    failed_contract_ids: list[str]
    failed_session_scope_ids: list[str]

    def summary(self) -> str:
        failed_count = (
            len(self.failed_hit_ids)
            + len(self.failed_misquote_ids)
            + len(self.failed_notice_ids)
            + len(self.failed_contract_ids)
            + len(self.failed_session_scope_ids)
        )
        return (
            f"total={self.total_samples}, "
            f"hit={self.hit_rate:.1%}, "
            f"misquote={self.misquote_rate:.1%}, "
            f"no_hit_notice={self.no_hit_notice_rate:.1%}, "
            f"contract={self.contract_consistency_rate:.1%}, "
            f"session_isolation={self.session_isolation_rate:.1%}, "
            f"gate_passed={self.gate_passed}, "
            f"failed={failed_count}"
        )


def _extract_inline_chunk_ids(content: str) -> list[str]:
    if not content:
        return []
    return [chunk_id.strip() for chunk_id in _CITE_TAG_RE.findall(content) if chunk_id]


def _extract_citation_chunk_ids(sample: dict) -> list[str]:
    citations = sample.get("citations")
    if not isinstance(citations, list):
        return []
    chunk_ids: list[str] = []
    for item in citations:
        if not isinstance(item, dict):
            continue
        chunk_id = str(item.get("chunk_id", "")).strip()
        if chunk_id:
            chunk_ids.append(chunk_id)
    return chunk_ids


def _extract_observability_has_rag_context(sample: dict) -> bool | None:
    if "observability_has_rag_context" in sample:
        return bool(sample.get("observability_has_rag_context"))
    observability = sample.get("observability")
    if isinstance(observability, dict) and "has_rag_context" in observability:
        return bool(observability.get("has_rag_context"))
    return None


def _is_contract_consistent(sample: dict, used: set[str]) -> bool:
    rag_hit_raw = sample.get("rag_hit")
    rag_hit = bool(rag_hit_raw) if rag_hit_raw is not None else None
    observability_has_rag = _extract_observability_has_rag_context(sample)

    citation_chunk_ids = _extract_citation_chunk_ids(sample)
    citation_chunk_set = set(citation_chunk_ids)
    inline_chunk_set = set(
        _extract_inline_chunk_ids(
            str(
                sample.get("assistant_markdown")
                or sample.get("assistant_content")
                or sample.get("assistant_answer")
                or ""
            )
        )
    )

    evidence_ids = used or citation_chunk_set
    checks: list[bool] = []

    if rag_hit is not None:
        checks.append(rag_hit == bool(evidence_ids))
    if observability_has_rag is not None:
        expected_has_rag = rag_hit if rag_hit is not None else bool(evidence_ids)
        checks.append(observability_has_rag == expected_has_rag)
    if inline_chunk_set or citation_chunk_set:
        checks.append(inline_chunk_set == citation_chunk_set)
    if rag_hit is False:
        checks.append(not inline_chunk_set and not citation_chunk_set)
    if rag_hit is True:
        checks.append(bool(citation_chunk_set))

    return all(checks) if checks else True


def _is_session_scope_consistent(sample: dict) -> bool | None:
    session_id = sample.get("session_id")
    source_session_ids = sample.get("source_session_ids")
    if not session_id or not isinstance(source_session_ids, list):
        return None
    target = str(session_id).strip()
    observed = [str(value).strip() for value in source_session_ids]
    return all(value == target for value in observed)


def compute_metrics(
    samples: list[dict],
    *,
    min_hit_rate: float = 0.90,
    max_misquote_rate: float = 0.05,
    min_no_hit_notice_rate: float = 0.95,
    min_contract_consistency_rate: float = 0.95,
    min_session_isolation_rate: float = 1.0,
) -> DialogueMemoryMetrics:
    if not samples:
        return DialogueMemoryMetrics(
            0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            False,
            [],
            [],
            [],
            [],
            [],
        )

    hit_total = 0
    hit_pass = 0

    misquote_total = 0
    misquote_count = 0

    no_hit_total = 0
    no_hit_notice_pass = 0

    contract_total = 0
    contract_pass = 0

    session_scope_total = 0
    session_scope_pass = 0

    failed_hit_ids: list[str] = []
    failed_misquote_ids: list[str] = []
    failed_notice_ids: list[str] = []
    failed_contract_ids: list[str] = []
    failed_session_scope_ids: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        expected = set(sample.get("expected_source_ids", []))
        used = set(sample.get("used_source_ids", []))
        has_notice = bool(sample.get("has_no_hit_notice", False))

        if expected:
            hit_total += 1
            if used & expected:
                hit_pass += 1
            else:
                failed_hit_ids.append(sample_id)
        else:
            no_hit_total += 1
            if has_notice:
                no_hit_notice_pass += 1
            else:
                failed_notice_ids.append(sample_id)

        misquote_total += 1
        if expected:
            wrong_refs = used - expected
            if wrong_refs:
                misquote_count += 1
                failed_misquote_ids.append(sample_id)
        elif used:
            misquote_count += 1
            failed_misquote_ids.append(sample_id)

        contract_total += 1
        if _is_contract_consistent(sample, used):
            contract_pass += 1
        else:
            failed_contract_ids.append(sample_id)

        session_scope_ok = _is_session_scope_consistent(sample)
        if session_scope_ok is not None:
            session_scope_total += 1
            if session_scope_ok:
                session_scope_pass += 1
            else:
                failed_session_scope_ids.append(sample_id)

    hit_rate = hit_pass / hit_total if hit_total > 0 else 0.0
    misquote_rate = misquote_count / misquote_total if misquote_total > 0 else 0.0
    no_hit_notice_rate = no_hit_notice_pass / no_hit_total if no_hit_total > 0 else 0.0
    contract_consistency_rate = (
        contract_pass / contract_total if contract_total > 0 else 0.0
    )
    session_isolation_rate = (
        session_scope_pass / session_scope_total if session_scope_total > 0 else 0.0
    )

    gate_checks = [
        hit_rate >= min_hit_rate if hit_total > 0 else True,
        misquote_rate <= max_misquote_rate if misquote_total > 0 else True,
        no_hit_notice_rate >= min_no_hit_notice_rate if no_hit_total > 0 else True,
        (
            contract_consistency_rate >= min_contract_consistency_rate
            if contract_total > 0
            else True
        ),
        (
            session_isolation_rate >= min_session_isolation_rate
            if session_scope_total > 0
            else True
        ),
    ]
    gate_passed = all(gate_checks)

    return DialogueMemoryMetrics(
        total_samples=len(samples),
        hit_rate=hit_rate,
        misquote_rate=misquote_rate,
        no_hit_notice_rate=no_hit_notice_rate,
        contract_consistency_rate=contract_consistency_rate,
        session_isolation_rate=session_isolation_rate,
        gate_passed=gate_passed,
        failed_hit_ids=failed_hit_ids,
        failed_misquote_ids=failed_misquote_ids,
        failed_notice_ids=failed_notice_ids,
        failed_contract_ids=failed_contract_ids,
        failed_session_scope_ids=failed_session_scope_ids,
    )


def run_audit(
    dataset_path: Path, output_path: Path | None = None
) -> DialogueMemoryMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    thresholds = dataset.get("thresholds", {}) or {}
    metrics = compute_metrics(
        samples,
        min_hit_rate=float(thresholds.get("min_hit_rate", 0.90)),
        max_misquote_rate=float(thresholds.get("max_misquote_rate", 0.05)),
        min_no_hit_notice_rate=float(thresholds.get("min_no_hit_notice_rate", 0.95)),
        min_contract_consistency_rate=float(
            thresholds.get("min_contract_consistency_rate", 0.95)
        ),
        min_session_isolation_rate=float(
            thresholds.get("min_session_isolation_rate", 1.0)
        ),
    )

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "hit_rate": metrics.hit_rate,
                "misquote_rate": metrics.misquote_rate,
                "no_hit_notice_rate": metrics.no_hit_notice_rate,
                "contract_consistency_rate": metrics.contract_consistency_rate,
                "session_isolation_rate": metrics.session_isolation_rate,
                "gate_passed": metrics.gate_passed,
                "failed_hit_ids": metrics.failed_hit_ids,
                "failed_misquote_ids": metrics.failed_misquote_ids,
                "failed_notice_ids": metrics.failed_notice_ids,
                "failed_contract_ids": metrics.failed_contract_ids,
                "failed_session_scope_ids": metrics.failed_session_scope_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D6 对话资料记忆质量评测")
    parser.add_argument(
        "--dataset",
        default="eval/dialogue_memory_samples.json",
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
