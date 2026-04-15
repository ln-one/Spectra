"""Interactive game fallback content."""

from __future__ import annotations

from typing import Any

from services.generation_session_service.game_template_engine import (
    build_game_fallback_data,
    is_template_game_pattern,
    render_game_html,
    resolve_game_pattern,
)


def fallback_game_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "课堂互动主题")
    mode = resolve_game_pattern(config)
    if is_template_game_pattern(mode):
        game_data = build_game_fallback_data(
            pattern=mode,
            config=config,
            rag_snippets=rag_snippets,
        )
        return {
            "kind": "interactive_game",
            "title": str(game_data.get("game_title") or f"{topic}互动游戏"),
            "summary": str(game_data.get("instruction") or ""),
            "game_pattern": mode,
            "game_data": game_data,
            "countdown": int(config.get("countdown") or 60),
            "life": int(config.get("life") or 3),
            "html": render_game_html(mode, game_data),
        }

    countdown = int(config.get("countdown") or 60)
    life = int(config.get("life") or 3)
    idea_tags = [str(tag) for tag in (config.get("idea_tags") or [])]
    list_items = "".join(
        f"<li>{item}</li>"
        for item in (
            rag_snippets[:3]
            or [f"围绕{topic}完成挑战", "答对可解锁下一关", "教师可口头追加规则"]
        )
    )
    badges = "".join(f"<span class='badge'>{tag}</span>" for tag in idea_tags[:4])
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{topic}互动游戏</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 0; background: #f8fafc;
      color: #0f172a; }}
    main {{ max-width: 860px; margin: 0 auto; padding: 32px 20px 48px; }}
    .hero {{ background: linear-gradient(135deg, #dcfce7, #eff6ff);
      border-radius: 24px; padding: 24px; }}
    .meta {{ display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }}
    .pill, .badge {{ display: inline-flex; border-radius: 999px;
      padding: 6px 12px; background: white; border: 1px solid #cbd5e1;
      font-size: 14px; }}
    section {{ margin-top: 20px; background: white; border: 1px solid #e2e8f0;
      border-radius: 20px; padding: 20px; }}
    button {{ border: none; border-radius: 12px; padding: 12px 18px;
      background: #0f766e; color: white; cursor: pointer; }}
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <h1>{topic}互动游戏</h1>
      <p>模式：{mode}。教师可直接投屏讲解，学生按回合完成挑战。</p>
      <div class="meta">
        <span class="pill">倒计时 {countdown}s</span>
        <span class="pill">生命值 {life}</span>
        {badges}
      </div>
    </div>
    <section>
      <h2>闯关素材</h2>
      <ul>{list_items}</ul>
    </section>
    <section>
      <h2>课堂规则</h2>
      <p>点击按钮进入下一轮。教师可根据班级反应，自由加减提示或惩罚。</p>
      <button
        onclick="document.getElementById('status').textContent = '已进入下一轮，请学生口头作答。';"
      >开始下一轮</button>
      <p id="status" style="margin-top:12px;">准备开始。</p>
    </section>
  </main>
</body>
</html>"""
    return {
        "kind": "interactive_game",
        "title": f"{topic}互动游戏",
        "game_pattern": mode,
        "countdown": countdown,
        "life": life,
        "html": html,
    }
