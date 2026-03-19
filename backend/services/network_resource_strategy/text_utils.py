"""Shared text and token helpers for network resource normalization."""

from __future__ import annotations

import hashlib
import re

_TOKEN_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]{2,}")
_ASR_FILLERS = ["嗯", "啊", "额", "然后", "就是说", "这个", "那个"]


def tokenize(text: str) -> set[str]:
    return set(_TOKEN_RE.findall((text or "").lower()))


def normalize_whitespace(text: str) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    return compact.replace(" ，", "，").replace(" 。", "。")


def build_text_fingerprint(text: str) -> str:
    digest = hashlib.sha1(normalize_whitespace(text).encode("utf-8")).hexdigest()
    return digest[:16]


def compute_relevance_score(text: str, query: str) -> float:
    query_tokens = tokenize(query)
    if not query_tokens:
        return 0.0
    text_lower = (text or "").lower()
    overlap = query_tokens & tokenize(text_lower)
    lexical_score = len(overlap) / len(query_tokens)
    fuzzy_hit = sum(1 for token in query_tokens if token and token in text_lower)
    fuzzy_score = fuzzy_hit / len(query_tokens)
    return max(lexical_score, fuzzy_score)


def clean_asr_text(text: str) -> str:
    normalized = normalize_whitespace(text)
    for filler in _ASR_FILLERS:
        normalized = re.sub(
            rf"(?:^|[，,\s]){re.escape(filler)}(?:[，,\s]|$)", " ", normalized
        )
    normalized = re.sub(r"[，,]{2,}", "，", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" ，,")
    return normalized
