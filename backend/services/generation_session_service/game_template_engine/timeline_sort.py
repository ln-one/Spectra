"""Interactive game HTML template."""

from __future__ import annotations


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
        li.innerHTML = "<div class='event-title'>" + event.label + "</div>";
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
