"""Word preview and printable HTML rendering."""

from __future__ import annotations

import html
from typing import Any

from .common import (
    _html_card,
    _html_list,
    _require_dict,
    _string_list,
    resolve_word_document_variant,
)


def _render_layout_body(document_variant: str, payload: dict[str, Any]) -> str:
    variant = resolve_word_document_variant(document_variant)
    layout = payload["layout_payload"]
    summary_html = f"<p class=\"lede\">{html.escape(payload['summary'])}</p>"

    if variant == "layered_lesson_plan":
        objectives = layout["learning_objectives"]
        flow_rows = "".join(
            [
                (
                    "<tr>"
                    f"<td>{html.escape(item['phase'])}</td>"
                    f"<td>{html.escape(item['duration'])}</td>"
                    f"<td>{html.escape('；'.join(_string_list(item.get('teacher_actions'))))}</td>"
                    f"<td>{html.escape('；'.join(_string_list(item.get('student_actions'))))}</td>"
                    f"<td>{html.escape('；'.join(_string_list(item.get('outputs'))))}</td>"
                    "</tr>"
                )
                for item in layout["lesson_flow"]
            ]
        )
        return (
            summary_html
            + '<div class="meta-grid">'
            + _html_card(
                "教学情境", f"<p>{html.escape(layout['teaching_context'])}</p>"
            )
            + _html_card("学情画像", f"<p>{html.escape(layout['learner_profile'])}</p>")
            + "</div>"
            + '<div class="triple-grid">'
            + _html_card(
                "A层目标",
                f"<ul>{_html_list(_string_list(objectives.get('a_level')))}</ul>",
                "accent-a",
            )
            + _html_card(
                "B层目标",
                f"<ul>{_html_list(_string_list(objectives.get('b_level')))}</ul>",
                "accent-b",
            )
            + _html_card(
                "C层目标",
                f"<ul>{_html_list(_string_list(objectives.get('c_level')))}</ul>",
                "accent-c",
            )
            + "</div>"
            + _html_card(
                "教学流程",
                (
                    "<table><thead><tr><th>环节</th><th>时长</th><th>教师活动</th>"
                    "<th>学生活动</th><th>产出</th></tr></thead>"
                    f"<tbody>{flow_rows}</tbody></table>"
                ),
            )
            + '<div class="two-grid">'
            + _html_card(
                "关键问题",
                f"<ul>{_html_list(_string_list(layout.get('key_questions')))}</ul>",
            )
            + _html_card(
                "差异化与评价",
                (
                    "<p><strong>差异化支持：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('differentiation_strategies'))))}</p>"
                    "<p><strong>评价方式：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('assessment_methods'))))}</p>"
                    "<p><strong>作业建议：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('homework'))))}</p>"
                ),
            )
            + "</div>"
        )

    if variant == "student_handout":
        terms_rows = "".join(
            [
                "<tr>"
                f"<td>{html.escape(item['term'])}</td>"
                f"<td>{html.escape(item['explanation'])}</td>"
                "</tr>"
                for item in layout["key_terms"]
            ]
        )
        concept_cards = "".join(
            [
                _html_card(
                    item["heading"],
                    f"<ul>{_html_list(_string_list(item.get('bullets')))}</ul>",
                )
                for item in layout["core_concepts"]
            ]
        )
        example_cards = "".join(
            [
                _html_card(
                    item["title"],
                    f"<ol>{''.join(f'<li>{html.escape(step)}</li>' for step in _string_list(item.get('steps')))}</ol>",
                    "example-card",
                )
                for item in layout["worked_examples"]
            ]
        )
        return (
            summary_html
            + _html_card(
                "学习目标",
                f"<ul>{_html_list(_string_list(layout.get('learning_goals')))}</ul>",
            )
            + _html_card(
                "关键术语",
                "<table><thead><tr><th>术语</th><th>解释</th></tr></thead>"
                f"<tbody>{terms_rows}</tbody></table>",
            )
            + '<div class="card-stack">'
            + concept_cards
            + "</div>"
            + '<div class="two-grid">'
            + _html_card("例题拆解", example_cards)
            + _html_card(
                "练习与总结",
                (
                    "<p><strong>练习任务：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('practice_tasks'))))}</p>"
                    "<blockquote>"
                    f"{html.escape(layout['summary_box'])}"
                    "</blockquote>"
                    "<p><strong>课后整理：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('after_class_notes'))))}</p>"
                ),
            )
            + "</div>"
        )

    if variant == "post_class_quiz":
        section_blocks = []
        for section in layout["sections"]:
            questions_html = "".join(
                [
                    (
                        '<div class="question-block">'
                        f"<p><strong>{index + 1}. {html.escape(question['prompt'])}</strong> "
                        f"（{question['score']}分）</p>"
                        + (
                            "<ul>"
                            + _html_list(_string_list(question.get("options")))
                            + "</ul>"
                            if _string_list(question.get("options"))
                            else ""
                        )
                        + (
                            f"<p class=\"muted\"><strong>参考答案：</strong>{html.escape(str(question['answer']))}</p>"
                            if str(question.get("answer") or "").strip()
                            else ""
                        )
                        + (
                            f"<p class=\"muted\"><strong>解析：</strong>{html.escape(str(question['analysis']))}</p>"
                            if str(question.get("analysis") or "").strip()
                            else ""
                        )
                        + "</div>"
                    )
                    for index, question in enumerate(section["questions"])
                ]
            )
            section_blocks.append(
                _html_card(
                    f"{section['section_title']} / {section['question_type']}",
                    questions_html,
                )
            )
        exam_meta = layout["exam_meta"]
        return (
            summary_html
            + _html_card(
                "试卷信息",
                (
                    "<p><strong>作答时长：</strong>"
                    f"{exam_meta['duration_minutes']} 分钟</p>"
                    "<p><strong>总分：</strong>"
                    f"{exam_meta['total_score']} 分</p>"
                    "<p><strong>作答说明：</strong>"
                    f"{html.escape('；'.join(_string_list(exam_meta.get('instructions'))))}</p>"
                ),
            )
            + "".join(section_blocks)
            + _html_card(
                "评分与答案栏",
                (
                    "<p><strong>评分提示：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('grading_notes'))))}</p>"
                    "<p><strong>答案栏：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('answer_sheet')) or ['按题号填写']))}</p>"
                ),
            )
        )

    observation = layout["observation_table"]
    rows = "".join(
        [
            "<tr>"
            + "".join(f"<td>{html.escape(str(cell))}</td>" for cell in row)
            + "</tr>"
            for row in observation["rows"]
        ]
    )
    return (
        summary_html
        + _html_card(
            "实验概况",
            (
                "<p><strong>实验名称：</strong>"
                f"{html.escape(layout['experiment_meta']['experiment_name'])}</p>"
                "<p><strong>预计时长：</strong>"
                f"{html.escape(layout['experiment_meta']['estimated_time'])}</p>"
                "<p><strong>难度等级：</strong>"
                f"{html.escape(layout['experiment_meta']['difficulty'])}</p>"
            ),
        )
        + '<div class="two-grid">'
        + _html_card(
            "实验目标", f"<ul>{_html_list(_string_list(layout.get('objectives')))}</ul>"
        )
        + _html_card(
            "材料与安全",
            (
                "<p><strong>实验材料：</strong>"
                f"{html.escape('；'.join(_string_list(layout.get('materials'))))}</p>"
                "<p><strong>安全提醒：</strong>"
                f"{html.escape('；'.join(_string_list(layout.get('safety_notes'))))}</p>"
            ),
        )
        + "</div>"
        + _html_card(
            "实验步骤",
            "<ol>"
            + "".join(
                [
                    (
                        f"<li><strong>{html.escape(item['action'])}</strong>"
                        f"<br /><span class=\"muted\">预期结果：{html.escape(item['expected_result'])}</span></li>"
                    )
                    for item in layout["procedure_steps"]
                ]
            )
            + "</ol>",
        )
        + _html_card(
            "观察记录",
            "<table><thead><tr>"
            + "".join(
                f"<th>{html.escape(column)}</th>"
                for column in _string_list(observation.get("columns"))
            )
            + "</tr></thead><tbody>"
            + rows
            + "</tbody></table>",
        )
        + _html_card(
            "反思与提交",
            (
                "<p><strong>反思问题：</strong>"
                f"{html.escape('；'.join(_string_list(layout.get('reflection_questions'))))}</p>"
                "<p><strong>提交要求：</strong>"
                f"{html.escape('；'.join(_string_list(layout.get('submission_requirements'))))}</p>"
            ),
        )
    )


def _render_word_html(
    document_variant: str, payload: dict[str, Any], *, printable: bool
) -> str:
    body = _render_layout_body(document_variant, payload)
    printable_class = " printable" if printable else ""
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(payload["title"])}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f5f7fb;
      --paper: #ffffff;
      --ink: #14213d;
      --muted: #5b6475;
      --line: #d8deea;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --green-soft: #dcfce7;
      --amber-soft: #fef3c7;
      --rose-soft: #fee2e2;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: {"0" if printable else "24px"};
      background: {"#ffffff" if printable else "var(--bg)"};
      color: var(--ink);
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      line-height: 1.6;
    }}
    .doc-shell{printable_class} {{
      max-width: 980px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 32px;
      box-shadow: {"none" if printable else "0 20px 50px rgba(15, 23, 42, 0.08)"};
    }}
    .doc-header {{ margin-bottom: 24px; }}
    .eyebrow {{ color: var(--accent); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }}
    h1 {{ margin: 8px 0 0; font-size: 30px; line-height: 1.25; }}
    h2 {{ margin: 0 0 10px; font-size: 20px; }}
    h3 {{ margin: 0 0 10px; font-size: 16px; }}
    p, li, td, th, blockquote {{ font-size: 14px; }}
    .lede {{ color: var(--muted); margin: 0 0 18px; }}
    .meta-grid, .two-grid, .triple-grid {{ display: grid; gap: 16px; margin-bottom: 16px; }}
    .meta-grid, .two-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    .triple-grid {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
    .card-stack {{ display: grid; gap: 16px; margin-bottom: 16px; }}
    .card {{
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      background: #fff;
      margin-bottom: 16px;
    }}
    .accent-a {{ background: var(--accent-soft); }}
    .accent-b {{ background: var(--green-soft); }}
    .accent-c {{ background: var(--amber-soft); }}
    .example-card {{ background: #f8fafc; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border: 1px solid var(--line); padding: 10px; vertical-align: top; text-align: left; }}
    th {{ background: #eff6ff; }}
    ul, ol {{ margin: 0; padding-left: 20px; }}
    blockquote {{
      margin: 12px 0 0;
      padding: 12px 14px;
      border-left: 4px solid var(--accent);
      background: #f8fafc;
    }}
    .muted {{ color: var(--muted); }}
    .question-block + .question-block {{ margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line); }}
    @media (max-width: 860px) {{
      body {{ padding: 12px; }}
      .doc-shell {{ padding: 20px; border-radius: 18px; }}
      .meta-grid, .two-grid, .triple-grid {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main class="doc-shell{printable_class}">
    <header class="doc-header">
      <div class="eyebrow">{html.escape(resolve_word_document_variant(document_variant).replace("_", " "))}</div>
      <h1>{html.escape(payload["title"])}</h1>
    </header>
    {body}
  </main>
</body>
</html>"""


def render_word_preview_html(document_variant: str, payload: dict[str, Any]) -> str:
    return _render_word_html(document_variant, payload, printable=False)


def render_word_doc_source_html(document_variant: str, payload: dict[str, Any]) -> str:
    return _render_word_html(document_variant, payload, printable=True)
