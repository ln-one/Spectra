"""Interactive game HTML template."""

from __future__ import annotations


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
