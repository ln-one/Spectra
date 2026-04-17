"""Interactive game HTML template."""

from __future__ import annotations


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
