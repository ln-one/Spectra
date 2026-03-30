from __future__ import annotations

from typing import Any

SUPPORTED_CARD_IDS = {
    "courseware_ppt",
    "word_document",
    "knowledge_mindmap",
    "interactive_quick_quiz",
    "interactive_games",
    "classroom_qa_simulator",
    "demonstration_animations",
    "speaker_notes",
}


def card_query_text(card_id: str, config: dict[str, Any]) -> str:
    if card_id == "courseware_ppt":
        return str(
            config.get("topic") or config.get("system_prompt_tone") or "教学课件生成"
        )
    if card_id == "word_document":
        return str(config.get("topic") or config.get("document_variant") or "教学文档")
    if card_id == "knowledge_mindmap":
        return str(config.get("topic") or config.get("focus_scope") or "课程知识结构")
    if card_id == "interactive_quick_quiz":
        return str(config.get("scope") or config.get("question_focus") or "随堂测验")
    if card_id == "interactive_games":
        return str(config.get("topic") or config.get("creative_brief") or "互动游戏")
    if card_id == "classroom_qa_simulator":
        return str(
            config.get("topic") or config.get("question_focus") or "课堂问答预演"
        )
    if card_id == "demonstration_animations":
        return str(config.get("topic") or config.get("motion_brief") or "演示动画")
    if card_id == "speaker_notes":
        return str(config.get("topic") or "逐页说课讲稿")
    return "教学工具生成"


def fallback_quiz_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    scope = str(config.get("scope") or config.get("question_focus") or "核心知识点")
    difficulty = str(config.get("difficulty") or "medium")
    question_type = str(config.get("question_type") or "single")
    count = int(config.get("count") or config.get("question_count") or 5)
    style_tags = list(config.get("style_tags") or [])
    questions = []
    for index in range(max(1, min(count, 10))):
        snippet = rag_snippets[index % len(rag_snippets)] if rag_snippets else ""
        options = [
            f"{scope}的基础理解",
            f"{scope}的常见误区",
            f"{scope}的迁移应用",
            f"{scope}的反例辨析",
        ]
        questions.append(
            {
                "id": f"quiz-{index + 1}",
                "question": (
                    f"第{index + 1}题：围绕“{scope}”设计一题"
                    f"{difficulty}难度的{question_type}题。"
                ),
                "options": options,
                "answer": options[0],
                "explanation": (
                    f"解析聚焦“{scope}”的教学重点。"
                    + (f" 参考资料提示：{snippet[:120]}" if snippet else "")
                    + (
                        f" 风格要求：{'、'.join(str(tag) for tag in style_tags[:3])}"
                        if style_tags
                        else ""
                    )
                ).strip(),
            }
        )
    return {
        "kind": "quiz",
        "title": f"{scope}随堂小测",
        "scope": scope,
        "difficulty": difficulty,
        "question_count": len(questions),
        "question_type": question_type,
        "questions": questions,
    }


def fallback_courseware_ppt_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "教学主题")
    pages = max(6, min(int(config.get("pages") or 12), 40))
    audience = str(config.get("audience") or "intermediate")
    template = str(config.get("template") or "default")
    snippet = rag_snippets[0][:120] if rag_snippets else ""
    return {
        "kind": "courseware_ppt",
        "title": f"{topic}课件",
        "summary": (
            f"面向 {audience} 层级生成 {pages} 页课件，模板 {template}。"
            + (f" 参考资料：{snippet}" if snippet else "")
        ).strip(),
        "pages": pages,
        "audience": audience,
        "template": template,
    }


def fallback_word_document_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "教学主题")
    variant = str(config.get("document_variant") or "layered_lesson_plan")
    snippet = rag_snippets[0][:120] if rag_snippets else ""
    return {
        "kind": "word_document",
        "title": f"{topic}文档",
        "summary": (
            f"生成文档类型：{variant}。" + (f" 参考资料：{snippet}" if snippet else "")
        ).strip(),
        "document_variant": variant,
    }


def fallback_mindmap_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "课程主题")
    focus = str(config.get("focus") or config.get("focus_scope") or "concept")
    depth = max(2, min(int(config.get("depth") or 3), 4))
    nodes = [
        {
            "id": "root",
            "parent_id": None,
            "title": topic,
            "summary": f"聚焦{focus}视角组织知识结构。",
        }
    ]
    branch_titles = ["核心概念", "关键过程", "典型误区", "课堂应用"]
    for index in range(depth):
        branch_id = f"node-{index + 1}"
        summary = (
            rag_snippets[index][:140]
            if index < len(rag_snippets)
            else f"{topic}的第{index + 1}个重点分支。"
        )
        nodes.append(
            {
                "id": branch_id,
                "parent_id": "root",
                "title": branch_titles[index % len(branch_titles)],
                "summary": summary,
            }
        )
        nodes.append(
            {
                "id": f"{branch_id}-detail",
                "parent_id": branch_id,
                "title": f"{branch_titles[index % len(branch_titles)]}展开",
                "summary": (
                    f"面向{config.get('target_audience') or '当前班级'}"
                    "补充可讲解细节。"
                ),
            }
        )
    return {
        "title": f"{topic}思维导图",
        "kind": "mindmap",
        "topic": topic,
        "focus": focus,
        "depth": depth,
        "nodes": nodes,
    }


def fallback_game_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "课堂互动主题")
    mode = str(config.get("mode") or config.get("game_pattern") or "freeform")
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


def fallback_simulator_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or config.get("question_focus") or "课堂重点")
    profile = str(config.get("profile") or "detail_oriented")
    intensity = int(config.get("intensity") or 60)
    turns = []
    hints = rag_snippets[:3] or [
        f"请解释{topic}的关键前提。",
        f"如果学生继续追问，补充{topic}的反例。",
        "最后给出板书或课堂活动建议。",
    ]
    for index, hint in enumerate(hints, start=1):
        turns.append(
            {
                "student": f"{profile}_student_{index}",
                "question": f"第{index}轮追问：{hint[:80]}",
                "teacher_hint": (
                    "建议教师先用一句话回应，再补一个例子。" f" 强度档位 {intensity}。"
                ),
                "feedback": "观察是否回答到概念边界、步骤依据和易错点。",
            }
        )
    return {
        "kind": "classroom_qa_simulator",
        "title": f"{topic}学情预演",
        "summary": (
            f"围绕“{topic}”生成 {len(turns)} 轮课堂问答预演，" f"学生画像为 {profile}。"
        ),
        "key_points": [
            "先回应学生真实困惑，再给结构化解释。",
            "保留一个追问节点，检查教师是否讲到边界条件。",
            "最后补课堂策略，帮助落回教学目标。",
        ],
        "turns": turns,
        "question_focus": topic,
        "student_profiles": [profile],
    }


def fallback_animation_content(
    config: dict[str, Any], rag_snippets: list[str]
) -> dict[str, Any]:
    topic = str(config.get("topic") or "演示主题")
    scene = str(config.get("scene") or "generic")
    speed = int(config.get("speed") or 50)
    requested_format = str(config.get("animation_format") or "html5").strip().lower()
    description = (
        rag_snippets[0][:140] if rag_snippets else f"围绕{topic}展示关键过程。"
    )
    html = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{topic}演示动画</title>
<style>
body {{ margin:0; font-family: Arial, sans-serif; background:#020617; color:#e2e8f0; }}
main {{ min-height:100vh; display:grid; place-items:center; }}
.stage {{ width:min(760px,90vw); padding:32px; border-radius:24px;
  background:linear-gradient(135deg,#0f172a,#1e293b); }}
.track {{ margin-top:24px; height:8px; background:#1e293b;
  border-radius:999px; overflow:hidden; }}
.bar {{ width:30%; height:100%; background:#22c55e;
  animation: move {max(2, 12 - speed // 10)}s ease-in-out infinite alternate; }}
@keyframes move {{
  from {{ transform: translateX(0); }}
  to {{ transform: translateX(220%); }}
}}
</style></head>
<body><main><div class="stage"><h1>{topic}</h1><p>场景：{scene}</p>
<p>{description}</p><div class="track"><div class="bar"></div></div></div>
</main></body></html>"""
    return {
        "kind": "animation_storyboard",
        "title": f"{topic}演示动画",
        "summary": description,
        "html": html,
        "format": requested_format,
        "scene": scene,
        "speed": speed,
        "show_trail": bool(config.get("show_trail", True)),
        "split_view": bool(config.get("split_view", True)),
        "line_color": str(config.get("line_color") or "#22c55e"),
        "scenes": [{"title": topic, "description": description}],
    }


def fallback_speaker_notes_content(
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None,
    source_artifact_id: str | None,
) -> dict[str, Any]:
    topic = str(config.get("topic") or "课堂说课讲稿")
    tone = str(config.get("tone") or "professional")
    emphasize_interaction = bool(config.get("emphasize_interaction", True))
    normalized_source_artifact_id = str(
        source_artifact_id or config.get("source_artifact_id") or ""
    ).strip()
    slides = []
    base_titles = ["教学目标", "核心知识", "重点难点", "课堂互动"]
    hints = rag_snippets[:4] or [
        f"围绕{topic}说明课程定位。",
        f"说明{topic}的关键知识结构。",
        "解释本课的重点与难点设计。",
        "补充课堂互动与收束策略。",
    ]
    for index, hint in enumerate(hints, start=1):
        slides.append(
            {
                "page": index,
                "title": base_titles[(index - 1) % len(base_titles)],
                "script": (
                    f"第{index}页我会用{tone}语气展开讲解，"
                    f"先说明{topic}的教学意图，再承接到“{hint[:70]}”。"
                ),
                "action_hint": (
                    "建议停顿并与学生互动。"
                    if emphasize_interaction
                    else "保持平稳讲述节奏。"
                ),
                "transition_line": f"接下来过渡到第{index + 1}页的教学展开。",
            }
        )
    return {
        "kind": "speaker_notes",
        "title": f"{topic}说课讲稿",
        "summary": (
            f"基于 {source_hint or '当前课件'} 生成 {len(slides)} 页逐页讲稿，"
            f"语气为 {tone}。"
        ),
        "topic": topic,
        "tone": tone,
        "source_artifact_id": normalized_source_artifact_id or None,
        "slides": slides,
    }


def next_turn_anchor(turns: list[dict]) -> str:
    return f"turn-{len(turns) + 1}"


def fallback_simulator_turn_result(
    *,
    current_content: dict[str, Any],
    teacher_answer: str,
    config: dict[str, Any],
    turn_anchor: str | None,
    rag_snippets: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    turns = [
        dict(turn)
        for turn in (current_content.get("turns") or [])
        if isinstance(turn, dict)
    ]
    target_anchor = str(turn_anchor or "").strip()
    next_anchor = target_anchor or next_turn_anchor(turns)
    topic = str(
        config.get("topic")
        or current_content.get("question_focus")
        or current_content.get("title")
        or "课堂重点"
    )
    profile = str(
        config.get("profile")
        or (current_content.get("student_profiles") or ["detail_oriented"])[0]
    )
    hint = (
        rag_snippets[0][:80]
        if rag_snippets
        else f"{topic}里最容易被继续追问的边界条件是什么？"
    )
    question = f"如果进一步追问，{hint}"
    feedback = (
        "回答已经覆盖核心概念，下一步建议补充步骤依据和易错点。"
        if teacher_answer.strip()
        else "需要先给出明确回答，再补例子。"
    )
    score = 82 if teacher_answer.strip() else 55
    turn_record = {
        "turn_anchor": next_anchor,
        "student": profile,
        "question": question,
        "teacher_answer": teacher_answer,
        "teacher_hint": "先给一句结论，再补反例或步骤说明。",
        "feedback": feedback,
        "score": score,
    }
    if target_anchor:
        replaced = False
        for index, turn in enumerate(turns):
            if str(turn.get("turn_anchor") or "") == target_anchor:
                turns[index] = turn_record
                replaced = True
                break
        if not replaced:
            turns.append(turn_record)
    else:
        turns.append(turn_record)

    updated_content = dict(current_content)
    updated_content["kind"] = "classroom_qa_simulator"
    updated_content["turns"] = turns
    updated_content["summary"] = (
        f"围绕“{topic}”已累计完成 {len(turns)} 轮课堂问答预演。"
    )
    updated_content["question_focus"] = topic
    updated_content["student_profiles"] = [profile]
    turn_result = {
        "turn_anchor": next_anchor,
        "student_profile": profile,
        "student_question": question,
        "teacher_answer": teacher_answer,
        "feedback": feedback,
        "score": score,
        "next_focus": "受力分解与参考系",
    }
    return updated_content, turn_result


def fallback_content(
    *,
    card_id: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None = None,
    source_artifact_id: str | None = None,
) -> dict[str, Any]:
    if card_id == "courseware_ppt":
        return fallback_courseware_ppt_content(config, rag_snippets)
    if card_id == "word_document":
        return fallback_word_document_content(config, rag_snippets)
    if card_id == "interactive_quick_quiz":
        return fallback_quiz_content(config, rag_snippets)
    if card_id == "knowledge_mindmap":
        return fallback_mindmap_content(config, rag_snippets)
    if card_id == "interactive_games":
        return fallback_game_content(config, rag_snippets)
    if card_id == "classroom_qa_simulator":
        return fallback_simulator_content(config, rag_snippets)
    if card_id == "speaker_notes":
        return fallback_speaker_notes_content(
            config,
            rag_snippets,
            source_hint,
            source_artifact_id,
        )
    return fallback_animation_content(config, rag_snippets)
