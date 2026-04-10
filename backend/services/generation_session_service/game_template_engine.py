from __future__ import annotations

import json
from typing import Any

TEMPLATE_GAME_PATTERNS: tuple[str, ...] = (
    "timeline_sort",
    "concept_match",
    "quiz_challenge",
    "fill_in_blank",
)


def resolve_game_pattern(config: dict[str, Any] | None) -> str:
    cfg = dict(config or {})
    raw = str(cfg.get("mode") or cfg.get("game_pattern") or "freeform").strip().lower()
    return raw or "freeform"


def is_template_game_pattern(pattern: str) -> bool:
    return pattern in TEMPLATE_GAME_PATTERNS


def build_game_schema_hint(pattern: str) -> str:
    schema_hints = {
        "timeline_sort": (
            '{"game_title":"","instruction":"",'
            '"events":[{"id":"evt-1","label":"","year":"","hint":""}],'
            '"correct_order":["evt-1"],'
            '"success_message":"","retry_message":""}'
        ),
        "concept_match": (
            '{"game_title":"","instruction":"",'
            '"pairs":[{"id":"pair-1","concept":"","definition":""}],'
            '"success_message":"","retry_message":""}'
        ),
        "quiz_challenge": (
            '{"game_title":"","instruction":"","total_lives":3,'
            '"levels":[{"id":"level-1","question":"","options":["A","B","C","D"],'
            '"correct_index":0,"explanation":""}],'
            '"victory_message":"","game_over_message":""}'
        ),
        "fill_in_blank": (
            '{"game_title":"","instruction":"",'
            '"paragraphs":[{"id":"para-1","segments":[{"type":"text","content":""},'
            '{"type":"blank","blank_id":"b1","answer":"","hint":""}]}],'
            '"success_message":"","retry_message":""}'
        ),
    }
    if pattern not in schema_hints:
        raise ValueError(f"unsupported_game_pattern:{pattern}")
    return schema_hints[pattern]


def build_game_prompt(
    *,
    pattern: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> str:
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")
    topic = str(config.get("topic") or "课堂主题").strip()
    creative_brief = str(config.get("creative_brief") or "").strip()
    schema_hint = build_game_schema_hint(pattern)
    return (
        "You generate ONLY structured JSON data for a classroom interactive game.\n"
        "Do not output markdown fences. Do not output HTML/CSS/JS.\n"
        f"game_pattern: {pattern}\n"
        f"topic: {topic}\n"
        f"creative_brief: {creative_brief or 'none'}\n"
        f"rag_snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Requirements:\n"
        "- Keep all labels and instructions in Chinese.\n"
        "- Use concrete, teachable content.\n"
        "- Avoid placeholders and empty arrays.\n"
        "- Keep item counts practical for one slide game interaction.\n"
        f"Return shape example: {schema_hint}\n"
    )


def _require_non_empty_str(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"field_{key}_empty")


def _require_non_empty_list(payload: dict[str, Any], key: str) -> None:
    value = payload.get(key)
    if not isinstance(value, list) or not value:
        raise ValueError(f"field_{key}_empty")


def validate_game_data(pattern: str, data: dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ValueError("payload_not_object")
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")

    _require_non_empty_str(data, "game_title")
    _require_non_empty_str(data, "instruction")

    if pattern == "timeline_sort":
        _require_non_empty_list(data, "events")
        _require_non_empty_list(data, "correct_order")
        _require_non_empty_str(data, "success_message")
        _require_non_empty_str(data, "retry_message")
        event_ids: list[str] = []
        for item in data["events"]:
            if not isinstance(item, dict):
                raise ValueError("field_events_item_invalid")
            for key in ("id", "label", "year"):
                value = item.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"field_events_{key}_empty")
            event_ids.append(str(item["id"]).strip())
        for event_id in data["correct_order"]:
            if not isinstance(event_id, str) or not event_id.strip():
                raise ValueError("field_correct_order_item_empty")
            if event_id not in event_ids:
                raise ValueError("field_correct_order_unknown_id")
    elif pattern == "concept_match":
        _require_non_empty_list(data, "pairs")
        _require_non_empty_str(data, "success_message")
        _require_non_empty_str(data, "retry_message")
        for item in data["pairs"]:
            if not isinstance(item, dict):
                raise ValueError("field_pairs_item_invalid")
            for key in ("id", "concept", "definition"):
                value = item.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"field_pairs_{key}_empty")
    elif pattern == "quiz_challenge":
        _require_non_empty_list(data, "levels")
        _require_non_empty_str(data, "victory_message")
        _require_non_empty_str(data, "game_over_message")
        lives = data.get("total_lives")
        if not isinstance(lives, int) or lives <= 0:
            raise ValueError("field_total_lives_invalid")
        for item in data["levels"]:
            if not isinstance(item, dict):
                raise ValueError("field_levels_item_invalid")
            for key in ("id", "question", "explanation"):
                value = item.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"field_levels_{key}_empty")
            options = item.get("options")
            if not isinstance(options, list) or len(options) < 2:
                raise ValueError("field_levels_options_invalid")
            if not all(isinstance(opt, str) and opt.strip() for opt in options):
                raise ValueError("field_levels_options_item_empty")
            correct_index = item.get("correct_index")
            if not isinstance(correct_index, int):
                raise ValueError("field_levels_correct_index_invalid")
            if correct_index < 0 or correct_index >= len(options):
                raise ValueError("field_levels_correct_index_out_of_range")
    elif pattern == "fill_in_blank":
        _require_non_empty_list(data, "paragraphs")
        _require_non_empty_str(data, "success_message")
        _require_non_empty_str(data, "retry_message")
        for item in data["paragraphs"]:
            if not isinstance(item, dict):
                raise ValueError("field_paragraphs_item_invalid")
            paragraph_id = item.get("id")
            if not isinstance(paragraph_id, str) or not paragraph_id.strip():
                raise ValueError("field_paragraphs_id_empty")
            segments = item.get("segments")
            if not isinstance(segments, list) or not segments:
                raise ValueError("field_paragraphs_segments_empty")
            has_blank = False
            for segment in segments:
                if not isinstance(segment, dict):
                    raise ValueError("field_segments_item_invalid")
                segment_type = str(segment.get("type") or "").strip()
                if segment_type == "text":
                    content = segment.get("content")
                    if not isinstance(content, str) or not content:
                        raise ValueError("field_segments_text_empty")
                    continue
                if segment_type == "blank":
                    has_blank = True
                    blank_id = segment.get("blank_id")
                    answer = segment.get("answer")
                    if not isinstance(blank_id, str) or not blank_id.strip():
                        raise ValueError("field_segments_blank_id_empty")
                    if not isinstance(answer, str) or not answer.strip():
                        raise ValueError("field_segments_answer_empty")
                    continue
                raise ValueError("field_segments_type_invalid")
            if not has_blank:
                raise ValueError("field_paragraphs_blank_missing")


def _safe_json_for_script(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def _timeline_sort_template() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>时间轴排序</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Microsoft YaHei', Arial, sans-serif; background: #f4f7ff; color: #1f2937; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 20px; }
    .card { background: #fff; border: 1px solid #dbe3ff; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(37, 99, 235, 0.08); }
    h1 { margin: 0; color: #1d4ed8; font-size: 28px; }
    .instruction { margin: 8px 0 0; color: #334155; }
    .timeline { list-style: none; margin: 16px 0; padding: 0; display: grid; gap: 10px; }
    .event { background: #eef2ff; border: 1px dashed #93c5fd; border-radius: 12px; padding: 10px; cursor: move; }
    .event.dragging { opacity: 0.5; }
    .event-title { font-weight: 700; }
    .event-year { color: #2563eb; font-size: 13px; margin-top: 4px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    button { border: none; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 700; }
    .check-btn { background: #2563eb; color: #fff; }
    .reset-btn { background: #e2e8f0; color: #1e293b; }
    .result { margin-top: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1 id="title"></h1>
      <p class="instruction" id="instruction"></p>
      <ul id="timeline" class="timeline"></ul>
      <div class="actions">
        <button class="check-btn" id="checkBtn">检查答案</button>
        <button class="reset-btn" id="resetBtn">重新打乱</button>
      </div>
      <div id="result" class="result"></div>
    </div>
  </div>
  <script>
    const gameData = __GAME_DATA__;
    const titleEl = document.getElementById("title");
    const instructionEl = document.getElementById("instruction");
    const timelineEl = document.getElementById("timeline");
    const resultEl = document.getElementById("result");
    const checkBtn = document.getElementById("checkBtn");
    const resetBtn = document.getElementById("resetBtn");
    titleEl.textContent = gameData.game_title;
    instructionEl.textContent = gameData.instruction;
    let currentEvents = gameData.events.slice();
    let draggingId = null;
    function shuffle(items) {
      const clone = items.slice();
      for (let i = clone.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
      }
      return clone;
    }
    function renderEvents() {
      timelineEl.innerHTML = "";
      currentEvents.forEach((event) => {
        const li = document.createElement("li");
        li.className = "event";
        li.draggable = true;
        li.dataset.id = event.id;
        li.innerHTML = "<div class='event-title'>" + event.label + "</div><div class='event-year'>" + event.year + "</div>";
        li.addEventListener("dragstart", (e) => {
          draggingId = event.id;
          li.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        li.addEventListener("dragend", () => {
          li.classList.remove("dragging");
        });
        li.addEventListener("dragover", (e) => e.preventDefault());
        li.addEventListener("drop", (e) => {
          e.preventDefault();
          const targetId = event.id;
          if (!draggingId || draggingId === targetId) return;
          const sourceIdx = currentEvents.findIndex((it) => it.id === draggingId);
          const targetIdx = currentEvents.findIndex((it) => it.id === targetId);
          if (sourceIdx < 0 || targetIdx < 0) return;
          const [moved] = currentEvents.splice(sourceIdx, 1);
          currentEvents.splice(targetIdx, 0, moved);
          renderEvents();
        });
        timelineEl.appendChild(li);
      });
    }
    checkBtn.addEventListener("click", () => {
      const actual = currentEvents.map((event) => event.id);
      const ok = JSON.stringify(actual) === JSON.stringify(gameData.correct_order);
      resultEl.textContent = ok ? gameData.success_message : gameData.retry_message;
      resultEl.style.color = ok ? "#047857" : "#dc2626";
    });
    resetBtn.addEventListener("click", () => {
      currentEvents = shuffle(gameData.events);
      resultEl.textContent = "";
      renderEvents();
    });
    currentEvents = shuffle(currentEvents);
    renderEvents();
  </script>
</body>
</html>"""


def _concept_match_template() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>概念连线</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Microsoft YaHei', Arial, sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
    .panel { background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0; color: #0f766e; font-size: 28px; }
    .instruction { margin: 8px 0 14px; color: #334155; }
    .board { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    .col { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 12px; }
    .item { display: block; width: 100%; text-align: left; border: 1px solid #94a3b8; background: #fff; border-radius: 10px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
    .item.selected { border-color: #0284c7; box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.18); }
    .item.matched { background: #dcfce7; border-color: #16a34a; }
    .actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
    button { border: none; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 700; }
    .check-btn { background: #0284c7; color: #fff; }
    .clear-btn { background: #e2e8f0; color: #1e293b; }
    .result { margin-top: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1 id="title"></h1>
      <p class="instruction" id="instruction"></p>
      <div class="board">
        <div class="col">
          <h3>概念</h3>
          <div id="concepts"></div>
        </div>
        <div class="col">
          <h3>定义</h3>
          <div id="definitions"></div>
        </div>
      </div>
      <div class="actions">
        <button class="check-btn" id="checkBtn">检查连线</button>
        <button class="clear-btn" id="clearBtn">清空连线</button>
      </div>
      <div id="result" class="result"></div>
    </div>
  </div>
  <script>
    const gameData = __GAME_DATA__;
    const titleEl = document.getElementById("title");
    const instructionEl = document.getElementById("instruction");
    const conceptsEl = document.getElementById("concepts");
    const definitionsEl = document.getElementById("definitions");
    const resultEl = document.getElementById("result");
    titleEl.textContent = gameData.game_title;
    instructionEl.textContent = gameData.instruction;
    const mappings = {};
    let selectedConceptId = null;
    let selectedDefinitionId = null;
    const definitionById = {};
    const conceptById = {};
    gameData.pairs.forEach((pair) => {
      conceptById[pair.id] = pair.concept;
      definitionById[pair.id] = pair.definition;
    });
    function render() {
      conceptsEl.innerHTML = "";
      definitionsEl.innerHTML = "";
      Object.entries(conceptById).forEach(([id, concept]) => {
        const btn = document.createElement("button");
        btn.className = "item";
        btn.textContent = concept;
        btn.dataset.id = id;
        if (selectedConceptId === id) btn.classList.add("selected");
        if (mappings[id]) btn.classList.add("matched");
        btn.addEventListener("click", () => {
          selectedConceptId = id;
          if (selectedDefinitionId) {
            mappings[id] = selectedDefinitionId;
            selectedConceptId = null;
            selectedDefinitionId = null;
          }
          render();
        });
        conceptsEl.appendChild(btn);
      });
      Object.entries(definitionById).forEach(([id, definition]) => {
        const btn = document.createElement("button");
        btn.className = "item";
        btn.textContent = definition;
        btn.dataset.id = id;
        if (selectedDefinitionId === id) btn.classList.add("selected");
        if (Object.values(mappings).includes(id)) btn.classList.add("matched");
        btn.addEventListener("click", () => {
          selectedDefinitionId = id;
          if (selectedConceptId) {
            mappings[selectedConceptId] = id;
            selectedConceptId = null;
            selectedDefinitionId = null;
          }
          render();
        });
        definitionsEl.appendChild(btn);
      });
    }
    document.getElementById("checkBtn").addEventListener("click", () => {
      const ok = gameData.pairs.every((pair) => mappings[pair.id] === pair.id);
      resultEl.textContent = ok ? gameData.success_message : gameData.retry_message;
      resultEl.style.color = ok ? "#047857" : "#dc2626";
    });
    document.getElementById("clearBtn").addEventListener("click", () => {
      Object.keys(mappings).forEach((id) => delete mappings[id]);
      selectedConceptId = null;
      selectedDefinitionId = null;
      resultEl.textContent = "";
      render();
    });
    render();
  </script>
</body>
</html>"""


def _quiz_challenge_template() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>知识闯关</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Microsoft YaHei', Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 22px; }
    .panel { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 18px; }
    h1 { margin: 0; font-size: 28px; color: #f8fafc; }
    .instruction { color: #cbd5e1; margin: 8px 0 14px; }
    .meta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .pill { background: #1e293b; border: 1px solid #475569; border-radius: 999px; padding: 6px 12px; font-weight: 700; }
    .question-card { background: #1e293b; border-radius: 12px; padding: 14px; }
    .question { font-size: 22px; margin: 0 0 12px; color: #f8fafc; }
    .options { display: grid; gap: 10px; }
    .option { border: 1px solid #64748b; border-radius: 10px; background: #0f172a; color: #e2e8f0; padding: 10px; text-align: left; cursor: pointer; }
    .option:hover { border-color: #38bdf8; }
    .feedback { margin-top: 12px; font-weight: 700; min-height: 24px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1 id="title"></h1>
      <p id="instruction" class="instruction"></p>
      <div class="meta">
        <span id="levelPill" class="pill"></span>
        <span id="lifePill" class="pill"></span>
      </div>
      <div class="question-card">
        <p id="question" class="question"></p>
        <div id="options" class="options"></div>
        <div id="feedback" class="feedback"></div>
      </div>
    </div>
  </div>
  <script>
    const gameData = __GAME_DATA__;
    const titleEl = document.getElementById("title");
    const instructionEl = document.getElementById("instruction");
    const levelPillEl = document.getElementById("levelPill");
    const lifePillEl = document.getElementById("lifePill");
    const questionEl = document.getElementById("question");
    const optionsEl = document.getElementById("options");
    const feedbackEl = document.getElementById("feedback");
    titleEl.textContent = gameData.game_title;
    instructionEl.textContent = gameData.instruction;
    let current = 0;
    let lives = gameData.total_lives;
    function render() {
      if (lives <= 0) {
        questionEl.textContent = "挑战失败";
        optionsEl.innerHTML = "";
        feedbackEl.textContent = gameData.game_over_message;
        feedbackEl.style.color = "#f87171";
        levelPillEl.textContent = "关卡结束";
        lifePillEl.textContent = "生命: 0";
        return;
      }
      if (current >= gameData.levels.length) {
        questionEl.textContent = "全部通关";
        optionsEl.innerHTML = "";
        feedbackEl.textContent = gameData.victory_message;
        feedbackEl.style.color = "#34d399";
        levelPillEl.textContent = "已通关";
        lifePillEl.textContent = "生命: " + lives;
        return;
      }
      const level = gameData.levels[current];
      levelPillEl.textContent = "第 " + (current + 1) + " / " + gameData.levels.length + " 关";
      lifePillEl.textContent = "生命: " + lives;
      questionEl.textContent = level.question;
      optionsEl.innerHTML = "";
      feedbackEl.textContent = "";
      level.options.forEach((option, idx) => {
        const btn = document.createElement("button");
        btn.className = "option";
        btn.textContent = String.fromCharCode(65 + idx) + ". " + option;
        btn.addEventListener("click", () => {
          if (idx === level.correct_index) {
            feedbackEl.textContent = "回答正确：" + level.explanation;
            feedbackEl.style.color = "#34d399";
            current += 1;
            setTimeout(render, 700);
          } else {
            lives -= 1;
            feedbackEl.textContent = "回答错误：" + level.explanation;
            feedbackEl.style.color = "#f87171";
            setTimeout(render, 700);
          }
        });
        optionsEl.appendChild(btn);
      });
    }
    render();
  </script>
</body>
</html>"""


def _fill_in_blank_template() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>填空挑战</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Microsoft YaHei', Arial, sans-serif; background: #f8fafc; color: #1e293b; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
    .panel { background: #fff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; }
    h1 { margin: 0; color: #7c3aed; font-size: 28px; }
    .instruction { color: #475569; margin: 8px 0 14px; }
    .paragraph { margin-bottom: 12px; line-height: 1.9; font-size: 18px; }
    .blank-input { width: 140px; border: none; border-bottom: 2px solid #8b5cf6; padding: 2px 6px; font-size: 17px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    button { border: none; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 700; }
    .check-btn { background: #7c3aed; color: #fff; }
    .hint-btn { background: #e2e8f0; color: #1e293b; }
    .result { margin-top: 12px; font-weight: 700; min-height: 24px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1 id="title"></h1>
      <p id="instruction" class="instruction"></p>
      <div id="paragraphs"></div>
      <div class="actions">
        <button class="check-btn" id="checkBtn">检查答案</button>
        <button class="hint-btn" id="hintBtn">显示提示</button>
      </div>
      <div id="result" class="result"></div>
    </div>
  </div>
  <script>
    const gameData = __GAME_DATA__;
    const titleEl = document.getElementById("title");
    const instructionEl = document.getElementById("instruction");
    const paragraphsEl = document.getElementById("paragraphs");
    const resultEl = document.getElementById("result");
    titleEl.textContent = gameData.game_title;
    instructionEl.textContent = gameData.instruction;
    const blanks = {};
    function renderParagraphs() {
      paragraphsEl.innerHTML = "";
      gameData.paragraphs.forEach((paragraph) => {
        const container = document.createElement("div");
        container.className = "paragraph";
        paragraph.segments.forEach((segment) => {
          if (segment.type === "text") {
            container.appendChild(document.createTextNode(segment.content));
            return;
          }
          if (segment.type === "blank") {
            blanks[segment.blank_id] = segment;
            const input = document.createElement("input");
            input.className = "blank-input";
            input.dataset.blankId = segment.blank_id;
            input.placeholder = "填写答案";
            container.appendChild(input);
            return;
          }
        });
        paragraphsEl.appendChild(container);
      });
    }
    function normalize(text) {
      return String(text || "").trim().toLowerCase();
    }
    document.getElementById("checkBtn").addEventListener("click", () => {
      const inputs = paragraphsEl.querySelectorAll("input[data-blank-id]");
      let allOk = true;
      inputs.forEach((input) => {
        const blank = blanks[input.dataset.blankId];
        const ok = normalize(input.value) === normalize(blank.answer);
        input.style.borderBottomColor = ok ? "#16a34a" : "#dc2626";
        if (!ok) allOk = false;
      });
      resultEl.textContent = allOk ? gameData.success_message : gameData.retry_message;
      resultEl.style.color = allOk ? "#047857" : "#dc2626";
    });
    document.getElementById("hintBtn").addEventListener("click", () => {
      const hints = Object.values(blanks)
        .map((blank) => blank.hint ? blank.hint : ("答案首字：" + String(blank.answer || "").slice(0, 1)))
        .join("；");
      resultEl.textContent = "提示：" + hints;
      resultEl.style.color = "#0f766e";
    });
    renderParagraphs();
  </script>
</body>
</html>"""


_HTML_TEMPLATES: dict[str, str] = {
    "timeline_sort": _timeline_sort_template(),
    "concept_match": _concept_match_template(),
    "quiz_challenge": _quiz_challenge_template(),
    "fill_in_blank": _fill_in_blank_template(),
}


def render_game_html(pattern: str, data: dict[str, Any]) -> str:
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")
    validate_game_data(pattern, data)
    template = _HTML_TEMPLATES[pattern]
    return template.replace("__GAME_DATA__", _safe_json_for_script(data))


def build_game_fallback_data(
    *,
    pattern: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> dict[str, Any]:
    if not is_template_game_pattern(pattern):
        raise ValueError(f"unsupported_game_pattern:{pattern}")

    topic = str(config.get("topic") or "课堂主题").strip() or "课堂主题"
    source = rag_snippets[0][:120] if rag_snippets else ""
    base_instruction = (
        str(config.get("creative_brief") or "").strip()
        or f"围绕“{topic}”完成课堂互动，优先关注概念理解与应用。"
    )

    if pattern == "timeline_sort":
        events = [
            {
                "id": "evt-1",
                "label": f"{topic}导入",
                "year": "第1阶段",
                "hint": "先理解背景",
            },
            {
                "id": "evt-2",
                "label": f"{topic}核心机制",
                "year": "第2阶段",
                "hint": "提炼关键概念",
            },
            {
                "id": "evt-3",
                "label": f"{topic}应用练习",
                "year": "第3阶段",
                "hint": "结合案例",
            },
        ]
        if source:
            events[1]["hint"] = source
        payload = {
            "game_title": f"{topic}时间轴排序",
            "instruction": base_instruction,
            "events": events,
            "correct_order": [item["id"] for item in events],
            "success_message": "排序正确，时间线完整。",
            "retry_message": "顺序不对，回顾阶段关系后再试一次。",
        }
        validate_game_data(pattern, payload)
        return payload

    if pattern == "concept_match":
        pairs = [
            {
                "id": "pair-1",
                "concept": f"{topic}概念A",
                "definition": "用于描述基础定义与边界。",
            },
            {
                "id": "pair-2",
                "concept": f"{topic}概念B",
                "definition": "用于解释关键运行机制。",
            },
            {
                "id": "pair-3",
                "concept": f"{topic}概念C",
                "definition": "用于连接实际应用场景。",
            },
        ]
        if source:
            pairs[2]["definition"] = source
        payload = {
            "game_title": f"{topic}概念连线",
            "instruction": base_instruction,
            "pairs": pairs,
            "success_message": "连线全部正确，概念关联清晰。",
            "retry_message": "仍有连线错误，请先复习概念定义。",
        }
        validate_game_data(pattern, payload)
        return payload

    if pattern == "quiz_challenge":
        levels = [
            {
                "id": "level-1",
                "question": f"{topic}中最基础的概念是？",
                "options": ["核心定义", "无关术语", "随机记忆", "纯经验描述"],
                "correct_index": 0,
                "explanation": "先掌握核心定义，后续机制理解才稳定。",
            },
            {
                "id": "level-2",
                "question": f"{topic}的关键机制最接近下列哪一项？",
                "options": ["结构化流程", "完全随机", "不可解释过程", "纯背诵"],
                "correct_index": 0,
                "explanation": source or "关键机制应体现可解释、可验证的流程。",
            },
        ]
        payload = {
            "game_title": f"{topic}知识闯关",
            "instruction": base_instruction,
            "total_lives": max(1, min(int(config.get("life") or 3), 5)),
            "levels": levels,
            "victory_message": "恭喜通关，已完成全部关卡。",
            "game_over_message": "生命值耗尽，请回看解析后重试。",
        }
        validate_game_data(pattern, payload)
        return payload

    paragraphs = [
        {
            "id": "para-1",
            "segments": [
                {"type": "text", "content": f"在{topic}学习中，核心目标是理解"},
                {
                    "type": "blank",
                    "blank_id": "b1",
                    "answer": "关键概念",
                    "hint": "四个字",
                },
                {"type": "text", "content": "并将其迁移到真实问题求解中。"},
            ],
        },
        {
            "id": "para-2",
            "segments": [
                {"type": "text", "content": "课堂练习应覆盖"},
                {
                    "type": "blank",
                    "blank_id": "b2",
                    "answer": "机制分析",
                    "hint": "四个字",
                },
                {"type": "text", "content": "和结果验证两个层次。"},
            ],
        },
    ]
    if source:
        paragraphs[1]["segments"][-1]["content"] = f"并结合资料提示：{source}"

    payload = {
        "game_title": f"{topic}填空挑战",
        "instruction": base_instruction,
        "paragraphs": paragraphs,
        "success_message": "填空正确，理解到位。",
        "retry_message": "仍有空白未填对，请根据提示修正。",
    }
    validate_game_data(pattern, payload)
    return payload
