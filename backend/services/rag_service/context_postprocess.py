from __future__ import annotations

import logging
import os
import re
import time
from difflib import SequenceMatcher
from dataclasses import asdict, dataclass, field
from typing import Any, Awaitable, Callable, Iterable, Optional

logger = logging.getLogger(__name__)

CompressionCallable = Callable[[str, str, int], Awaitable[str | None]]

_DEFAULT_ENABLE_CONTEXT_DEDUP = True
_DEFAULT_ENABLE_CONTEXT_COMPRESSION = True
_DEFAULT_COMPRESSION_MODE = "rule"
_DEFAULT_MAX_EVIDENCE_CHUNKS = 5
_DEFAULT_MAX_SENTENCES_PER_CHUNK = 3
_DEFAULT_SIMILARITY_THRESHOLD = 0.82

_NORMALIZE_RE = re.compile(r"[^\w\u4e00-\u9fff]+", re.UNICODE)
_TOKEN_RE = re.compile(r"[A-Za-z0-9_+#\-.]{2,}|[\u4e00-\u9fff]{2,}", re.UNICODE)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?；;])|\n+")
_TEMPLATE_SENTENCE_PATTERNS = [
    re.compile(pattern)
    for pattern in [
        r"^项目需求文档$",
        r"^本文档来自",
        r"^技术实现要求$",
        r"^核心功能要求$",
        r"^项目价值$",
        r"^提交材料$",
        r"^技术选型$",
    ]
]
_STOP_TOKENS = {
    "这个",
    "我们",
    "你们",
    "他们",
    "以及",
    "进行",
    "需要",
    "支持",
    "要求",
    "系统",
    "项目",
    "内容",
    "资料",
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
}


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        return default
    return value if value > 0 else default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw.strip())
    except ValueError:
        return default
    return value if value > 0 else default


@dataclass(slots=True)
class ContextProcessingConfig:
    enable_context_dedup: bool = _DEFAULT_ENABLE_CONTEXT_DEDUP
    enable_context_compression: bool = _DEFAULT_ENABLE_CONTEXT_COMPRESSION
    compression_mode: str = _DEFAULT_COMPRESSION_MODE
    max_evidence_chunks: int = _DEFAULT_MAX_EVIDENCE_CHUNKS
    max_sentences_per_chunk: int = _DEFAULT_MAX_SENTENCES_PER_CHUNK
    similarity_threshold: float = _DEFAULT_SIMILARITY_THRESHOLD

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class RemovedChunkRecord:
    chunk_id: str
    kept_chunk_id: str
    reason: str


@dataclass(slots=True)
class CompressionRecord:
    chunk_id: str
    original_length: int
    compressed_length: int


@dataclass(slots=True)
class ContextProcessingDiagnostics:
    original_chunk_ids: list[str] = field(default_factory=list)
    deduped_chunk_ids: list[str] = field(default_factory=list)
    removed_chunks: list[RemovedChunkRecord] = field(default_factory=list)
    compression_stats: list[CompressionRecord] = field(default_factory=list)
    evidence_snippets: list[dict[str, str]] = field(default_factory=list)
    dedup_latency_ms: float = 0.0
    compression_latency_ms: float = 0.0
    compression_fallbacks: list[str] = field(default_factory=list)
    config: dict[str, Any] = field(default_factory=dict)

    def as_log_payload(self) -> dict[str, Any]:
        return {
            "original_chunk_ids": self.original_chunk_ids,
            "deduped_chunk_ids": self.deduped_chunk_ids,
            "removed_chunks": [asdict(item) for item in self.removed_chunks],
            "compression_stats": [asdict(item) for item in self.compression_stats],
            "evidence_snippets": self.evidence_snippets,
            "dedup_latency_ms": round(self.dedup_latency_ms, 2),
            "compression_latency_ms": round(self.compression_latency_ms, 2),
            "compression_fallbacks": self.compression_fallbacks,
            "config": self.config,
        }


def resolve_context_processing_config() -> ContextProcessingConfig:
    runtime_flags: dict[str, Any] = {}
    try:
        from services.system_settings_service import system_settings_service

        settings = system_settings_service.get_settings()
        runtime_flags = dict(settings.feature_flags.feature_flags or {})
    except Exception:
        runtime_flags = {}

    compression_mode = (
        str(
            runtime_flags.get(
                "compression_mode",
                os.getenv("RAG_CONTEXT_COMPRESSION_MODE", _DEFAULT_COMPRESSION_MODE),
            )
            or _DEFAULT_COMPRESSION_MODE
        )
        .strip()
        .lower()
    )
    if compression_mode not in {"rule", "llm", "hybrid"}:
        compression_mode = _DEFAULT_COMPRESSION_MODE

    return ContextProcessingConfig(
        enable_context_dedup=bool(
            runtime_flags.get(
                "enable_context_dedup",
                _env_bool(
                    "ENABLE_CONTEXT_DEDUP",
                    _DEFAULT_ENABLE_CONTEXT_DEDUP,
                ),
            )
        ),
        enable_context_compression=bool(
            runtime_flags.get(
                "enable_context_compression",
                _env_bool(
                    "ENABLE_CONTEXT_COMPRESSION",
                    _DEFAULT_ENABLE_CONTEXT_COMPRESSION,
                ),
            )
        ),
        compression_mode=compression_mode,
        max_evidence_chunks=int(
            runtime_flags.get(
                "max_evidence_chunks",
                _env_int(
                    "RAG_CONTEXT_MAX_EVIDENCE_CHUNKS",
                    _DEFAULT_MAX_EVIDENCE_CHUNKS,
                ),
            )
        ),
        max_sentences_per_chunk=int(
            runtime_flags.get(
                "max_sentences_per_chunk",
                _env_int(
                    "RAG_CONTEXT_MAX_SENTENCES_PER_CHUNK",
                    _DEFAULT_MAX_SENTENCES_PER_CHUNK,
                ),
            )
        ),
        similarity_threshold=float(
            runtime_flags.get(
                "similarity_threshold",
                _env_float(
                    "RAG_CONTEXT_SIMILARITY_THRESHOLD",
                    _DEFAULT_SIMILARITY_THRESHOLD,
                ),
            )
        ),
    )


def serialize_rag_results(rag_results: Iterable[Any]) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for item in rag_results:
        if item is None:
            continue
        if isinstance(item, dict):
            serialized.append(dict(item))
            continue
        model_dump = getattr(item, "model_dump", None)
        if callable(model_dump):
            serialized.append(dict(model_dump()))
            continue
        serialized.append(
            {
                "chunk_id": str(getattr(item, "chunk_id", "") or ""),
                "content": str(getattr(item, "content", "") or ""),
                "score": float(getattr(item, "score", 0.0) or 0.0),
                "source": dict(getattr(item, "source", {}) or {}),
                "metadata": dict(getattr(item, "metadata", {}) or {}),
            }
        )
    return serialized


def _normalize_text(text: str) -> str:
    compact = " ".join(str(text or "").split()).lower()
    compact = _NORMALIZE_RE.sub(" ", compact)
    return " ".join(compact.split())


def _fingerprint_text(text: str) -> str:
    return _normalize_text(text).replace(" ", "")


def _tokenize(text: str) -> list[str]:
    normalized = _normalize_text(text)
    if not normalized:
        return []
    tokens: list[str] = []
    for token in _TOKEN_RE.findall(normalized):
        compact = token.strip().lower()
        if len(compact) < 2:
            continue
        if compact in _STOP_TOKENS:
            continue
        tokens.append(compact)
        if re.fullmatch(r"[\u4e00-\u9fff]+", compact) and len(compact) > 4:
            tokens.extend(compact[i : i + 2] for i in range(len(compact) - 1))
    return tokens


def _query_terms(query: str) -> set[str]:
    return set(_tokenize(query))


def _jaccard_similarity(tokens_a: set[str], tokens_b: set[str]) -> float:
    if not tokens_a or not tokens_b:
        return 0.0
    union = tokens_a | tokens_b
    if not union:
        return 0.0
    return len(tokens_a & tokens_b) / len(union)


def _containment_similarity(tokens_a: set[str], tokens_b: set[str]) -> float:
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / max(1, min(len(tokens_a), len(tokens_b)))


def _string_similarity(text_a: str, text_b: str) -> float:
    if not text_a or not text_b:
        return 0.0
    return SequenceMatcher(None, text_a, text_b).ratio()


def _extract_title_hint(content: str) -> str:
    for line in str(content or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if len(stripped) <= 30:
            return _fingerprint_text(stripped)
        return _fingerprint_text(stripped[:30])
    return ""


def _max_sentence_similarity(content_a: str, content_b: str) -> float:
    sentences_a = _split_sentences(content_a)
    sentences_b = _split_sentences(content_b)
    if not sentences_a or not sentences_b:
        return 0.0

    max_similarity = 0.0
    for sentence_a in sentences_a:
        fingerprint_a = _fingerprint_text(sentence_a)
        tokens_a = set(_tokenize(sentence_a))
        for sentence_b in sentences_b:
            fingerprint_b = _fingerprint_text(sentence_b)
            tokens_b = set(_tokenize(sentence_b))
            similarity = max(
                _jaccard_similarity(tokens_a, tokens_b),
                _containment_similarity(tokens_a, tokens_b),
                _string_similarity(fingerprint_a, fingerprint_b),
            )
            if similarity > max_similarity:
                max_similarity = similarity
    return max_similarity


def _chunk_query_relevance(item: dict[str, Any], query_terms: set[str]) -> float:
    content = str(item.get("content", "") or "")
    score = float(item.get("score", 0.0) or 0.0)
    content_tokens = set(_tokenize(content))
    overlap = len(content_tokens & query_terms)
    exact_hits = sum(
        1 for term in query_terms if term and term in _normalize_text(content)
    )
    return (overlap * 2.5) + (exact_hits * 1.2) + (score * 3.0)


def _information_density(text: str) -> float:
    tokens = _tokenize(text)
    if not tokens:
        return 0.0
    unique_ratio = len(set(tokens)) / max(1, len(tokens))
    char_factor = min(len(_fingerprint_text(text)), 400) / 400
    return unique_ratio + char_factor


def _chunk_quality(item: dict[str, Any], query_terms: set[str]) -> float:
    content = str(item.get("content", "") or "")
    return _chunk_query_relevance(item, query_terms) + _information_density(content)


def _same_document(item_a: dict[str, Any], item_b: dict[str, Any]) -> bool:
    source_a = item_a.get("source") if isinstance(item_a.get("source"), dict) else {}
    source_b = item_b.get("source") if isinstance(item_b.get("source"), dict) else {}
    metadata_a = (
        item_a.get("metadata") if isinstance(item_a.get("metadata"), dict) else {}
    )
    metadata_b = (
        item_b.get("metadata") if isinstance(item_b.get("metadata"), dict) else {}
    )
    upload_a = str(metadata_a.get("upload_id") or "").strip()
    upload_b = str(metadata_b.get("upload_id") or "").strip()
    if upload_a and upload_a == upload_b:
        return True
    filename_a = str(source_a.get("filename") or "").strip().lower()
    filename_b = str(source_b.get("filename") or "").strip().lower()
    return bool(filename_a and filename_a == filename_b)


def _are_near_duplicates(
    item_a: dict[str, Any],
    item_b: dict[str, Any],
    *,
    threshold: float,
) -> tuple[bool, str]:
    chunk_id_a = str(item_a.get("chunk_id") or "").strip()
    chunk_id_b = str(item_b.get("chunk_id") or "").strip()
    if chunk_id_a and chunk_id_a == chunk_id_b:
        return True, "exact_chunk_id"

    content_a = str(item_a.get("content") or "")
    content_b = str(item_b.get("content") or "")
    fingerprint_a = _fingerprint_text(content_a)
    fingerprint_b = _fingerprint_text(content_b)
    if fingerprint_a and fingerprint_a == fingerprint_b:
        return True, "normalized_text"

    tokens_a = set(_tokenize(content_a))
    tokens_b = set(_tokenize(content_b))
    jaccard = _jaccard_similarity(tokens_a, tokens_b)
    containment = _containment_similarity(tokens_a, tokens_b)
    similarity = max(
        jaccard, containment, _string_similarity(fingerprint_a, fingerprint_b)
    )
    if similarity >= threshold:
        return True, "high_overlap"

    if _same_document(item_a, item_b):
        sentence_similarity = _max_sentence_similarity(content_a, content_b)
        title_a = _extract_title_hint(content_a)
        title_b = _extract_title_hint(content_b)
        if title_a and title_a == title_b and similarity >= max(0.65, threshold - 0.1):
            return True, "same_title_overlap"

        metadata_a = (
            item_a.get("metadata") if isinstance(item_a.get("metadata"), dict) else {}
        )
        metadata_b = (
            item_b.get("metadata") if isinstance(item_b.get("metadata"), dict) else {}
        )
        chunk_index_a = metadata_a.get("chunk_index")
        chunk_index_b = metadata_b.get("chunk_index")
        if (
            isinstance(chunk_index_a, int)
            and isinstance(chunk_index_b, int)
            and abs(chunk_index_a - chunk_index_b) <= 1
            and max(similarity, sentence_similarity) >= max(0.72, threshold - 0.1)
        ):
            return True, "adjacent_overlap"

    return False, ""


def _split_sentences(text: str) -> list[str]:
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        return []

    parts = [part.strip() for part in _SENTENCE_SPLIT_RE.split(raw) if part.strip()]
    sentences: list[str] = []
    for part in parts:
        if len(part) > 160 and "。" not in part and ". " in part:
            segments = [
                item.strip() for item in re.split(r"(?<=\.)\s+", part) if item.strip()
            ]
            sentences.extend(segments)
        else:
            sentences.append(part)
    return sentences


def _looks_template_sentence(sentence: str) -> bool:
    compact = " ".join(str(sentence or "").split())
    if not compact:
        return True
    return any(pattern.search(compact) for pattern in _TEMPLATE_SENTENCE_PATTERNS)


def _sentence_score(
    sentence: str,
    *,
    query_terms: set[str],
    position: int,
) -> float:
    normalized = _normalize_text(sentence)
    tokens = set(_tokenize(sentence))
    overlap = len(tokens & query_terms)
    exact_hits = sum(1 for term in query_terms if term and term in normalized)
    density = _information_density(sentence)
    score = (overlap * 3.0) + (exact_hits * 1.3) + (density * 1.8)
    if position == 0 and overlap > 0:
        score += 0.4
    if _looks_template_sentence(sentence) and overlap == 0:
        score -= 1.2
    if len(normalized) < 10 and overlap == 0:
        score -= 0.4
    return score


def _compress_with_rules(
    *,
    query: str,
    content: str,
    max_sentences: int,
) -> str:
    sentences = _split_sentences(content)
    if not sentences:
        return str(content or "")

    deduped_sentences: list[str] = []
    seen_sentences: set[str] = set()
    for sentence in sentences:
        fingerprint = _fingerprint_text(sentence)
        if not fingerprint or fingerprint in seen_sentences:
            continue
        seen_sentences.add(fingerprint)
        deduped_sentences.append(sentence.strip())

    query_terms = _query_terms(query)
    scored_sentences = [
        (
            _sentence_score(sentence, query_terms=query_terms, position=index),
            index,
            sentence,
        )
        for index, sentence in enumerate(deduped_sentences)
    ]
    positive = [item for item in scored_sentences if item[0] > 0]
    if positive:
        selected = sorted(
            positive,
            key=lambda item: (item[0], -item[1]),
            reverse=True,
        )[: max(1, max_sentences)]
        selected.sort(key=lambda item: item[1])
        result = " ".join(item[2].strip() for item in selected if item[2].strip())
        if result:
            return result

    fallback = [
        sentence
        for sentence in deduped_sentences
        if not _looks_template_sentence(sentence)
    ]
    if not fallback:
        fallback = deduped_sentences
    return " ".join(fallback[: max(1, max_sentences)]).strip()


async def _compress_with_llm(
    *,
    query: str,
    content: str,
    max_sentences: int,
    llm_compressor: Optional[CompressionCallable],
) -> str | None:
    if llm_compressor is None:
        return None
    return await llm_compressor(query, content, max_sentences)


async def postprocess_rag_context(
    *,
    query: str,
    rag_results: Iterable[Any],
    config: Optional[ContextProcessingConfig] = None,
    llm_compressor: Optional[CompressionCallable] = None,
) -> tuple[list[dict[str, Any]], ContextProcessingDiagnostics]:
    resolved_config = config or resolve_context_processing_config()
    diagnostics = ContextProcessingDiagnostics(config=resolved_config.as_dict())
    serialized = serialize_rag_results(rag_results)
    diagnostics.original_chunk_ids = [
        str(item.get("chunk_id") or "").strip()
        for item in serialized
        if str(item.get("chunk_id") or "").strip()
    ]
    if not serialized:
        return [], diagnostics

    candidates = [dict(item) for item in serialized]
    query_terms = _query_terms(query)

    started_at = time.perf_counter()
    if resolved_config.enable_context_dedup:
        kept: list[dict[str, Any]] = []
        for item in candidates:
            duplicate_index = None
            duplicate_reason = ""
            for index, kept_item in enumerate(kept):
                is_duplicate, reason = _are_near_duplicates(
                    item,
                    kept_item,
                    threshold=resolved_config.similarity_threshold,
                )
                if is_duplicate:
                    duplicate_index = index
                    duplicate_reason = reason
                    break

            if duplicate_index is None:
                kept.append(item)
                continue

            kept_item = kept[duplicate_index]
            current_quality = _chunk_quality(item, query_terms)
            kept_quality = _chunk_quality(kept_item, query_terms)
            if current_quality > kept_quality:
                diagnostics.removed_chunks.append(
                    RemovedChunkRecord(
                        chunk_id=str(kept_item.get("chunk_id") or ""),
                        kept_chunk_id=str(item.get("chunk_id") or ""),
                        reason=duplicate_reason,
                    )
                )
                kept[duplicate_index] = item
            else:
                diagnostics.removed_chunks.append(
                    RemovedChunkRecord(
                        chunk_id=str(item.get("chunk_id") or ""),
                        kept_chunk_id=str(kept_item.get("chunk_id") or ""),
                        reason=duplicate_reason,
                    )
                )
        candidates = kept
    diagnostics.dedup_latency_ms = (time.perf_counter() - started_at) * 1000

    max_chunks = max(1, resolved_config.max_evidence_chunks)
    candidates = candidates[:max_chunks]

    started_at = time.perf_counter()
    processed: list[dict[str, Any]] = []
    for item in candidates:
        content = str(item.get("content") or "")
        if not content:
            processed.append(item)
            continue

        compressed = content
        if resolved_config.enable_context_compression:
            compression_mode = resolved_config.compression_mode
            rule_seed = content
            used_fallback = False
            if compression_mode == "hybrid":
                rule_seed = _compress_with_rules(
                    query=query,
                    content=content,
                    max_sentences=resolved_config.max_sentences_per_chunk,
                )
                compressed = rule_seed
            if compression_mode in {"llm", "hybrid"}:
                llm_result = await _compress_with_llm(
                    query=query,
                    content=rule_seed,
                    max_sentences=resolved_config.max_sentences_per_chunk,
                    llm_compressor=llm_compressor,
                )
                if llm_result:
                    compressed = llm_result.strip()
                else:
                    used_fallback = True
                    if compression_mode == "llm":
                        diagnostics.compression_fallbacks.append(
                            "llm_unavailable_fallback_to_rule"
                        )
            if compression_mode == "rule" or used_fallback or not compressed:
                compressed = _compress_with_rules(
                    query=query,
                    content=content,
                    max_sentences=resolved_config.max_sentences_per_chunk,
                )

        final_content = compressed.strip() or content
        if len(final_content) > len(content):
            final_content = content

        updated = dict(item)
        if final_content != content:
            updated["content"] = final_content
            metadata = (
                dict(updated.get("metadata") or {})
                if isinstance(updated.get("metadata"), dict)
                else {}
            )
            context_processing = dict(metadata.get("context_processing") or {})
            context_processing.update(
                {
                    "compressed": True,
                    "compression_mode": resolved_config.compression_mode,
                    "original_length": len(content),
                    "compressed_length": len(final_content),
                }
            )
            metadata["context_processing"] = context_processing
            updated["metadata"] = metadata

        diagnostics.compression_stats.append(
            CompressionRecord(
                chunk_id=str(updated.get("chunk_id") or ""),
                original_length=len(content),
                compressed_length=len(str(updated.get("content") or "")),
            )
        )
        diagnostics.evidence_snippets.append(
            {
                "chunk_id": str(updated.get("chunk_id") or ""),
                "content": str(updated.get("content") or ""),
            }
        )
        processed.append(updated)

    diagnostics.compression_latency_ms = (time.perf_counter() - started_at) * 1000
    diagnostics.deduped_chunk_ids = [
        str(item.get("chunk_id") or "").strip()
        for item in processed
        if str(item.get("chunk_id") or "").strip()
    ]
    return processed, diagnostics


def log_context_processing(
    *,
    request_logger: logging.Logger,
    retrieval_latency_ms: float,
    diagnostics: ContextProcessingDiagnostics,
    project_id: str,
    query: str,
    session_id: str | None = None,
    caller: str = "rag_context",
) -> None:
    request_logger.info(
        "rag_context_postprocess caller=%s project=%s session=%s retrieval_ms=%.2f dedup_ms=%.2f compression_ms=%.2f raw_ids=%s deduped_ids=%s removed=%s compression=%s evidence=%s",
        caller,
        project_id,
        session_id,
        retrieval_latency_ms,
        diagnostics.dedup_latency_ms,
        diagnostics.compression_latency_ms,
        diagnostics.original_chunk_ids,
        diagnostics.deduped_chunk_ids,
        [asdict(item) for item in diagnostics.removed_chunks],
        [asdict(item) for item in diagnostics.compression_stats],
        diagnostics.evidence_snippets,
        extra={
            "project_id": project_id,
            "session_id": session_id,
            "rag_query": query,
            "retrieval_latency_ms": round(retrieval_latency_ms, 2),
            "dedup_latency_ms": round(diagnostics.dedup_latency_ms, 2),
            "compression_latency_ms": round(diagnostics.compression_latency_ms, 2),
            "raw_retrieved_chunk_ids": diagnostics.original_chunk_ids,
            "deduped_chunk_ids": diagnostics.deduped_chunk_ids,
            "removed_duplicate_chunks": [
                asdict(item) for item in diagnostics.removed_chunks
            ],
            "compression_stats": [
                asdict(item) for item in diagnostics.compression_stats
            ],
            "evidence_snippets": diagnostics.evidence_snippets,
            "context_processing_config": diagnostics.config,
            "context_processing_fallbacks": diagnostics.compression_fallbacks,
        },
    )
