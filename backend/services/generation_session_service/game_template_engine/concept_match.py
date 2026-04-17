"""Interactive game HTML template."""

from __future__ import annotations


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
    .item.matched { background: #f8fafc; }
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
    const assignedColorByConcept = {};
    const colorPalette = [
      "#2563eb",
      "#16a34a",
      "#d97706",
      "#db2777",
      "#7c3aed",
      "#0d9488",
      "#dc2626",
      "#4f46e5",
    ];
    let colorCursor = 0;
    let selectedConceptId = null;
    let selectedDefinitionId = null;
    const definitionById = {};
    const conceptById = {};
    gameData.pairs.forEach((pair) => {
      conceptById[pair.id] = pair.concept;
      definitionById[pair.id] = pair.definition;
    });
    const definitionOrder = Object.keys(definitionById);
    for (let i = definitionOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [definitionOrder[i], definitionOrder[j]] = [definitionOrder[j], definitionOrder[i]];
    }
    function render() {
      conceptsEl.innerHTML = "";
      definitionsEl.innerHTML = "";
      Object.entries(conceptById).forEach(([id, concept]) => {
        const btn = document.createElement("button");
        btn.className = "item";
        btn.textContent = concept;
        btn.dataset.id = id;
        if (selectedConceptId === id) btn.classList.add("selected");
        if (mappings[id]) {
          btn.classList.add("matched");
          const color = assignedColorByConcept[id] || "#16a34a";
          btn.style.borderColor = color;
          btn.style.boxShadow = "0 0 0 2px " + color + "33";
          btn.style.background = color + "14";
        } else {
          btn.style.borderColor = "";
          btn.style.boxShadow = "";
          btn.style.background = "";
        }
        btn.addEventListener("click", () => {
          selectedConceptId = id;
          if (selectedDefinitionId) {
            Object.keys(mappings).forEach((conceptId) => {
              if (mappings[conceptId] === selectedDefinitionId && conceptId !== id) {
                delete mappings[conceptId];
              }
            });
            mappings[id] = selectedDefinitionId;
            if (!assignedColorByConcept[id]) {
              assignedColorByConcept[id] = colorPalette[colorCursor % colorPalette.length];
              colorCursor += 1;
            }
            selectedConceptId = null;
            selectedDefinitionId = null;
          }
          render();
        });
        conceptsEl.appendChild(btn);
      });
      definitionOrder.forEach((id) => {
        const definition = definitionById[id];
        const btn = document.createElement("button");
        btn.className = "item";
        btn.textContent = definition;
        btn.dataset.id = id;
        if (selectedDefinitionId === id) btn.classList.add("selected");
        const linkedConceptId = Object.keys(mappings).find((conceptId) => mappings[conceptId] === id);
        if (linkedConceptId) {
          btn.classList.add("matched");
          const color = assignedColorByConcept[linkedConceptId] || "#16a34a";
          btn.style.borderColor = color;
          btn.style.boxShadow = "0 0 0 2px " + color + "33";
          btn.style.background = color + "14";
        } else {
          btn.style.borderColor = "";
          btn.style.boxShadow = "";
          btn.style.background = "";
        }
        btn.addEventListener("click", () => {
          selectedDefinitionId = id;
          if (selectedConceptId) {
            Object.keys(mappings).forEach((conceptId) => {
              if (mappings[conceptId] === id && conceptId !== selectedConceptId) {
                delete mappings[conceptId];
              }
            });
            mappings[selectedConceptId] = id;
            if (!assignedColorByConcept[selectedConceptId]) {
              assignedColorByConcept[selectedConceptId] = colorPalette[colorCursor % colorPalette.length];
              colorCursor += 1;
            }
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
      Object.keys(assignedColorByConcept).forEach((id) => delete assignedColorByConcept[id]);
      colorCursor = 0;
      selectedConceptId = null;
      selectedDefinitionId = null;
      resultEl.textContent = "";
      render();
    });
    render();
  </script>
</body>
</html>"""
