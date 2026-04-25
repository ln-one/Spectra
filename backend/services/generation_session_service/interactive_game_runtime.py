from __future__ import annotations

import json
from typing import Any

from .interactive_game_runtime_assets import (
    INTERACTIVE_GAME_RUNTIME_CSS,
    INTERACTIVE_GAME_RUNTIME_SCRIPT,
)

INTERACTIVE_GAME_SANDBOX_VERSION = "interactive_game_sandbox.v1"


def _safe_json_for_script(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False).replace("</script>", "<\\/script>")


def _escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_interactive_game_runtime(payload: dict[str, Any]) -> dict[str, Any]:
    runtime_payload = {
        "schema_id": str(payload.get("schema_id") or "interactive_game.v2"),
        "subtype": payload.get("subtype"),
        "title": payload.get("title"),
        "subtitle": payload.get("subtitle"),
        "teaching_goal": payload.get("teaching_goal"),
        "teacher_notes": payload.get("teacher_notes") or [],
        "instructions": payload.get("instructions") or [],
        "score_policy": payload.get("score_policy") or {},
        "completion_rule": payload.get("completion_rule") or {},
        "spec": payload.get("spec") or {},
    }
    bootstrap = _safe_json_for_script(runtime_payload)
    title = _escape_html(str(runtime_payload.get("title") or "互动游戏"))
    html = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{title}</title><style>{INTERACTIVE_GAME_RUNTIME_CSS}</style></head><body><div class="app"><div class="shell"><div class="hero"><div class="hero-copy"><h1 class="title" id="title"></h1><p class="subtitle" id="subtitle"></p></div><div class="meta" aria-label="游戏状态"><div class="metric"><span class="metric-label">玩法</span><span class="metric-value" id="subtype"></span></div><div class="metric"><span class="metric-label">得分</span><span class="metric-value" id="score"></span></div><div class="metric"><span class="metric-label">进度</span><span class="metric-value" id="progress"></span></div><div class="metric"><span class="metric-label">计时</span><span class="metric-value" id="timer"></span></div></div></div><div class="content"><div class="instructions" id="instructions"></div><div class="feedback" id="feedback">完成互动后点击“检查答案”。</div><div class="workspace" id="workspace"></div><div class="toolbar" style="margin-top:14px"><button type="button" class="primary" id="check-btn">检查答案</button><button type="button" id="reset-btn">重新开始</button></div></div></div></div><script>window.__SPECTRA_INTERACTIVE_GAME__={bootstrap};{INTERACTIVE_GAME_RUNTIME_SCRIPT}</script></body></html>"""
    return {
        "html": html,
        "sandbox_version": INTERACTIVE_GAME_SANDBOX_VERSION,
        "assets": [],
    }
