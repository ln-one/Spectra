import re
from typing import Optional


def build_card_context_hint(metadata: dict | None) -> str:
    if not isinstance(metadata, dict) or not metadata:
        return ""

    card_id = str(metadata.get("card_id") or "").strip()
    if not card_id:
        return ""

    hints = [f"当前正在微调 Studio 卡片：{card_id}。"]

    source_artifact_id = str(metadata.get("source_artifact_id") or "").strip()
    if source_artifact_id:
        hints.append(f"当前绑定的源成果为 {source_artifact_id}。")

    selection_keys = [
        "selected_script_segment",
        "selected_node_path",
        "current_question_id",
        "selection_anchor",
        "artifact_span",
        "active_student_profile",
        "turn_anchor",
    ]
    for key in selection_keys:
        value = metadata.get(key)
        if value:
            hints.append(f"{key}={value}")

    question_focus = metadata.get("question_focus")
    if question_focus:
        hints.append(f"当前追问焦点：{question_focus}")

    return " ".join(hints)


def normalize_chapter_token(token: str) -> str:
    return token.replace(" ", "")


def chinese_to_arabic(ch: str) -> Optional[int]:
    mapping = {
        "一": 1,
        "二": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6,
        "七": 7,
        "八": 8,
        "九": 9,
        "十": 10,
    }
    return mapping.get(ch)


def extract_chapter_tokens(query: str) -> list[str]:
    tokens: list[str] = []
    if not query:
        return tokens

    for match in re.findall(r"第\\s*([0-9]+)\\s*章", query):
        tokens.append(f"第{match}章")

    for match in re.findall(r"第\\s*([一二三四五六七八九十])\\s*章", query):
        tokens.append(f"第{match}章")
        arabic = chinese_to_arabic(match)
        if arabic is not None:
            tokens.append(f"第{arabic}章")

    seen = set()
    ordered = []
    for token in tokens:
        token = normalize_chapter_token(token)
        if token in seen:
            continue
        seen.add(token)
        ordered.append(token)
    return ordered


def rerank_by_chapter(query: str, rag_results: list):
    tokens = extract_chapter_tokens(query)
    if not tokens or not rag_results:
        return rag_results

    scored = []
    for result in rag_results:
        content = str(getattr(result, "content", "") or "")
        filename = str(getattr(getattr(result, "source", None), "filename", "") or "")
        match_score = 0
        for token in tokens:
            if token in content:
                match_score += 2
            if token in filename:
                match_score += 1
        scored.append((match_score, result))

    if not any(score > 0 for score, _ in scored):
        return rag_results

    scored.sort(key=lambda item: (item[0], getattr(item[1], "score", 0)), reverse=True)
    return [result for _, result in scored]
