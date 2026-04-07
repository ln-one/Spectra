from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

FRAME_WIDTH = 960
FRAME_HEIGHT = 540

_HTML_TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
    }
    #stage {
      width: 960px;
      height: 540px;
      overflow: hidden;
    }
    svg {
      display: block;
      width: 960px;
      height: 540px;
    }
  </style>
</head>
<body>
  <div id="stage"></div>
  <script>
    const WIDTH = 960;
    const HEIGHT = 540;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function hexToRgb(hex) {
      const normalized = String(hex || "").replace("#", "");
      if (normalized.length !== 6) {
        return [22, 163, 74];
      }
      return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
      ];
    }

    function withAlpha(hex, alpha) {
      const [r, g, b] = hexToRgb(hex);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function splitTextLines(text, maxChars) {
      const content = String(text || "").trim();
      if (!content) {
        return [];
      }
      const chunks = [];
      let current = "";
      for (const char of content) {
        current += char;
        if (current.length >= maxChars) {
          chunks.push(current);
          current = "";
        }
      }
      if (current) {
        chunks.push(current);
      }
      return chunks;
    }

    function renderTextBlock(x, y, text, options = {}) {
      const {
        fontSize = 18,
        fill = "#10231a",
        lineHeight = 28,
        maxChars = 18,
        fontWeight = 500,
      } = options;
      const lines = splitTextLines(text, maxChars);
      if (!lines.length) {
        return "";
      }
      return `
        <text x="${x}" y="${y}" font-family="PingFang SC, Microsoft YaHei, sans-serif"
          font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">
          ${lines.map((line, index) => `
            <tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>
          `).join("")}
        </text>
      `;
    }

    function renderChip(x, y, text, fill, stroke, textColor) {
      const width = Math.max(120, Math.min(240, text.length * 14 + 32));
      return `
        <g transform="translate(${x}, ${y})">
          <rect width="${width}" height="36" rx="18" fill="${fill}" stroke="${stroke}" />
          <text x="${width / 2}" y="23" text-anchor="middle"
            font-family="PingFang SC, Microsoft YaHei, sans-serif"
            font-size="15" font-weight="700" fill="${textColor}">
            ${escapeHtml(text)}
          </text>
        </g>
      `;
    }

    function renderHeader(spec, scene, progress) {
      const theme = spec.theme || {};
      return `
        <g>
          <text x="88" y="108" font-family="PingFang SC, Microsoft YaHei, sans-serif"
            font-size="34" font-weight="800" fill="${theme.text}">
            ${escapeHtml(spec.title)}
          </text>
          <text x="88" y="144" font-family="PingFang SC, Microsoft YaHei, sans-serif"
            font-size="18" fill="${theme.muted}">
            ${escapeHtml(spec.teaching_goal || spec.summary || "")}
          </text>
          ${renderChip(88, 62, scene.title || "镜头", withAlpha(theme.accent, 0.10), withAlpha(theme.accent, 0.25), theme.accent_deep)}
          ${renderChip(748, 62, `节奏：${spec.rhythm}`, withAlpha(theme.highlight, 0.12), withAlpha(theme.highlight, 0.28), theme.text)}
          <g transform="translate(88, 470)">
            <rect width="784" height="16" rx="8" fill="${theme.grid}" />
            <rect width="${Math.max(36, Math.round(784 * clamp(progress, 0, 1)))}" height="16" rx="8" fill="${theme.accent}" />
          </g>
        </g>
      `;
    }

    function renderProcessFlow(spec, scene, progress) {
      const theme = spec.theme || {};
      const scenes = Array.isArray(spec.scenes) ? spec.scenes : [];
      const gap = scenes.length > 1 ? 560 / (scenes.length - 1) : 0;
      const nodes = scenes.map((item, index) => {
        const cx = 138 + gap * index;
        const cy = 286;
        const active = item.id === scene.id;
        const scale = active ? 1 + progress * 0.08 : 1;
        return `
          <g transform="translate(${cx}, ${cy}) scale(${scale})">
            ${index > 0 ? `<line x1="${-gap}" y1="0" x2="-48" y2="0" stroke="${withAlpha(theme.accent, 0.25)}" stroke-width="10" stroke-linecap="round" />` : ""}
            <circle cx="0" cy="0" r="${active ? 30 : 24}" fill="${active ? theme.accent : theme.panel_alt}" stroke="${active ? theme.accent_deep : withAlpha(theme.accent, 0.28)}" stroke-width="4" />
            <text x="0" y="6" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" font-weight="800" fill="${active ? "#ffffff" : theme.accent_deep}">
              ${index + 1}
            </text>
            <text x="0" y="58" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="16" font-weight="700" fill="${theme.text}">
              ${escapeHtml(item.title || `步骤 ${index + 1}`)}
            </text>
          </g>
        `;
      }).join("");

      const bulletList = (scene.key_points || []).slice(0, 3).map((point, index) => `
        <g transform="translate(96, ${336 + index * 34})">
          <circle cx="0" cy="0" r="6" fill="${theme.highlight}" />
          <text x="18" y="6" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" fill="${theme.text}">
            ${escapeHtml(point)}
          </text>
        </g>
      `).join("");

      return `
        <g>
          <rect x="64" y="176" width="832" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
          ${nodes}
          <rect x="64" y="318" width="832" height="142" rx="24" fill="${withAlpha(theme.accent, 0.05)}" />
          <text x="96" y="352" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="22" font-weight="700" fill="${theme.accent_deep}">
            当前表现重点
          </text>
          <text x="96" y="386" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" fill="${theme.text}">
            ${escapeHtml(scene.description || "")}
          </text>
          ${bulletList}
        </g>
      `;
    }

    function renderRelationshipChange(spec, scene, progress) {
      const theme = spec.theme || {};
      const points = [0.18, 0.34, 0.52, 0.76];
      const path = points.map((value, index) => {
        const x = 128 + index * 130;
        const y = 382 - value * 180 - (index === 2 ? progress * 28 : 0);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
      const dots = points.map((value, index) => {
        const x = 128 + index * 130;
        const y = 382 - value * 180 - (index === 2 ? progress * 28 : 0);
        return `
          <g>
            <circle cx="${x}" cy="${y}" r="${index === 2 ? 14 : 10}" fill="${index === 2 ? theme.highlight : theme.accent}" />
            <text x="${x}" y="428" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="14" fill="${theme.muted}">
              ${index + 1}
            </text>
          </g>
        `;
      }).join("");
      const bullets = (scene.key_points || []).slice(0, 3).map((point, index) => `
        <text x="690" y="${238 + index * 34}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" fill="${theme.text}">
          ${escapeHtml(`• ${point}`)}
        </text>
      `).join("");
      return `
        <g>
          <rect x="64" y="176" width="560" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
          <line x1="118" y1="220" x2="118" y2="392" stroke="${theme.grid}" stroke-width="4" />
          <line x1="118" y1="392" x2="560" y2="392" stroke="${theme.grid}" stroke-width="4" />
          <path d="${path}" fill="none" stroke="${theme.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
          ${dots}
          <rect x="648" y="176" width="248" height="284" rx="32" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.25)}" />
          <text x="690" y="218" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="22" font-weight="700" fill="${theme.text}">
            变化解读
          </text>
          <text x="690" y="262" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" fill="${theme.accent_deep}">
            ${escapeHtml(scene.description || "")}
          </text>
          ${bullets}
        </g>
      `;
    }

    function renderStructureBreakdown(spec, scene, progress) {
      const theme = spec.theme || {};
      const objectDetails = Array.isArray(spec.object_details) && spec.object_details.length > 0
        ? spec.object_details
        : (Array.isArray(spec.objects) ? spec.objects.map((label) => ({ label, role: "" })) : []);
      const objects = objectDetails.length > 0
        ? objectDetails.map((item) => item.label)
        : (spec.scenes || []).map((item) => item.title).slice(0, 5);
      const focusSequence = Array.isArray(scene.focus_sequence) && scene.focus_sequence.length > 0
        ? scene.focus_sequence
        : objects;
      const activeIndex = Math.min(
        Math.max(focusSequence.length - 1, 0),
        Math.floor(progress * Math.max(focusSequence.length, 1))
      );
      const activeLabel = scene.title.includes("整体")
        ? ""
        : focusSequence[activeIndex] || "";
      const currentDetail = objectDetails.find((item) => item.label === activeLabel) || objectDetails[0] || { label: "整体结构", role: scene.description || "" };
      const panelTitle = activeLabel || "整体结构";
      const panelDescription = scene.title.includes("整体")
        ? "先建立五层整体顺序，再逐层展开每层职责与层间协作。"
        : (currentDetail.role || scene.description || "");
      const cards = objects.slice(0, 5).map((item, index) => {
        const x = 132;
        const y = 220 + index * 40 - (item === activeLabel ? progress * 4 : 0);
        const active = item === activeLabel;
        return `
          <g>
            <rect x="${x}" y="${y}" width="360" height="36" rx="18" fill="${active ? withAlpha(theme.accent, 0.16) : theme.panel}" stroke="${active ? theme.accent : withAlpha(theme.accent, 0.20)}" stroke-width="${active ? 4 : 3}" />
            <text x="${x + 22}" y="${y + 23}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" font-weight="700" fill="${active ? theme.accent_deep : theme.text}">
              ${escapeHtml(item || `部分 ${index + 1}`)}
            </text>
            ${active ? `<circle cx="${x + 324}" cy="${y + 18}" r="7" fill="${theme.highlight}" />` : ""}
          </g>
        `;
      }).join("");
      const bullets = (scene.key_points || objects.slice(0, 3)).slice(0, 3).map((point, index) => `
        ${renderTextBlock(608, 318 + index * 42, `• ${point}`, { fontSize: 16, fill: theme.text, lineHeight: 22, maxChars: 14 })}
      `).join("");
      return `
        <g>
          <rect x="64" y="176" width="832" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
          <text x="108" y="214" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="22" font-weight="700" fill="${theme.accent_deep}">
            分层结构
          </text>
          <text x="108" y="244" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="15" fill="${theme.muted}">
            自上而下展示每层职责，再回到层间协作
          </text>
          ${cards}
          <path d="M 520 258 C 566 258 566 338 520 338" fill="none" stroke="${withAlpha(theme.accent, 0.35)}" stroke-width="4" stroke-linecap="round" />
          <path d="M 520 306 C 566 306 566 386 520 386" fill="none" stroke="${withAlpha(theme.accent, 0.22)}" stroke-width="4" stroke-linecap="round" />
          <rect x="584" y="204" width="276" height="208" rx="28" fill="${withAlpha(theme.highlight, 0.08)}" stroke="${withAlpha(theme.highlight, 0.24)}" />
          <text x="608" y="236" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="22" font-weight="700" fill="${theme.text}">
            当前讲解
          </text>
          <text x="608" y="270" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="20" font-weight="700" fill="${theme.accent_deep}">
            ${escapeHtml(panelTitle)}
          </text>
          ${renderTextBlock(608, 294, panelDescription, {
            fontSize: 16,
            fill: theme.text,
            lineHeight: 22,
            maxChars: 14,
            fontWeight: 500,
          })}
          ${bullets}
          <rect x="108" y="404" width="404" height="36" rx="18" fill="${withAlpha(theme.accent, 0.07)}" />
          <text x="126" y="427" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="18" fill="${theme.accent_deep}">
            ${escapeHtml(scene.emphasis || "当前层高亮，其他层弱化")}
          </text>
        </g>
      `;
    }

    function renderFrame(spec, sceneIndex, sceneProgress, globalProgress) {
      const theme = spec.theme || {};
      const scenes = Array.isArray(spec.scenes) && spec.scenes.length > 0 ? spec.scenes : [{ id: "scene-1", title: "镜头 1", description: spec.summary || "" }];
      const safeSceneIndex = clamp(sceneIndex, 0, scenes.length - 1);
      const scene = scenes[safeSceneIndex];
      let body = "";
      if (spec.visual_type === "relationship_change") {
        body = renderRelationshipChange(spec, scene, sceneProgress);
      } else if (spec.visual_type === "structure_breakdown") {
        body = renderStructureBreakdown(spec, scene, sceneProgress);
      } else {
        body = renderProcessFlow(spec, scene, sceneProgress);
      }

      document.getElementById("stage").innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-label="${escapeHtml(spec.title)}">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${theme.background}" />
              <stop offset="100%" stop-color="${theme.panel_alt}" />
            </linearGradient>
          </defs>
          <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
          <circle cx="816" cy="104" r="${32 + sceneProgress * 18}" fill="${withAlpha(theme.highlight, 0.16)}" />
          <circle cx="748" cy="436" r="${54 - sceneProgress * 10}" fill="${withAlpha(theme.accent, 0.08)}" />
          ${renderHeader(spec, scene, globalProgress)}
          ${body}
        </svg>
      `;
      return true;
    }

    window.__spectraRenderFrame = renderFrame;
    window.__spectraRendererReady = true;
  </script>
</body>
</html>
"""


class AnimationBrowserRenderError(RuntimeError):
    """Raised when browser-based animation rendering fails."""


def build_frame_plan(spec: dict[str, Any]) -> list[dict[str, float | int]]:
    duration_seconds = max(3, min(int(spec.get("duration_seconds") or 6), 20))
    rhythm = str(spec.get("rhythm") or "balanced").strip().lower()
    fps = {"slow": 6, "balanced": 8, "fast": 10}.get(rhythm, 8)
    scenes = spec.get("scenes") or [{}]
    total_frames = max(len(scenes) * 6, min(duration_seconds * fps, 120))
    plan: list[dict[str, float | int]] = []
    for frame_index in range(total_frames):
        global_progress = frame_index / max(total_frames - 1, 1)
        scene_float = global_progress * len(scenes)
        scene_index = min(len(scenes) - 1, int(scene_float))
        scene_progress = scene_float - scene_index
        plan.append(
            {
                "scene_index": scene_index,
                "scene_progress": round(scene_progress, 4),
                "global_progress": round(global_progress, 4),
            }
        )
    return plan


def render_animation_frames(spec: dict[str, Any]) -> list[Image.Image]:
    try:
        from playwright.sync_api import sync_playwright
    except ModuleNotFoundError as exc:
        raise AnimationBrowserRenderError(
            "Playwright is required for browser-based animation rendering."
        ) from exc

    frame_plan = build_frame_plan(spec)
    if not frame_plan:
        raise AnimationBrowserRenderError("Animation frame plan is empty.")

    launch_kwargs: dict[str, Any] = {"headless": True}
    chrome_path = str(os.getenv("CHROME_PATH") or "").strip()
    if chrome_path:
        if Path(chrome_path).exists():
            launch_kwargs["executable_path"] = chrome_path
            launch_kwargs["args"] = ["--no-sandbox", "--disable-setuid-sandbox"]
        else:
            raise AnimationBrowserRenderError(
                f"Configured CHROME_PATH does not exist: {chrome_path}"
            )

    frames: list[Image.Image] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_kwargs)
        try:
            page = browser.new_page(
                viewport={"width": FRAME_WIDTH, "height": FRAME_HEIGHT}
            )
            page.set_content(_HTML_TEMPLATE, wait_until="domcontentloaded")
            page.wait_for_function(
                "() => window.__spectraRendererReady === true", timeout=15_000
            )
            stage = page.locator("#stage")

            for item in frame_plan:
                page.evaluate(
                    """(payload) => window.__spectraRenderFrame(
                        payload.spec,
                        payload.sceneIndex,
                        payload.sceneProgress,
                        payload.globalProgress
                    )""",
                    {
                        "spec": spec,
                        "sceneIndex": item["scene_index"],
                        "sceneProgress": item["scene_progress"],
                        "globalProgress": item["global_progress"],
                    },
                )
                png_bytes = stage.screenshot(type="png")
                frame = Image.open(BytesIO(png_bytes)).convert("RGB")
                frames.append(frame)
        except Exception as exc:
            raise AnimationBrowserRenderError(str(exc)) from exc
        finally:
            browser.close()
    return frames


def render_debug_html(spec: dict[str, Any]) -> str:
    payload = json.dumps(spec, ensure_ascii=False)
    return (
        "<!doctype html><html><head><meta charset='utf-8' /></head><body>"
        "<script>window.__SPECTRA_DEBUG_SPEC__ = "
        + payload
        + ";</script>"
        + _HTML_TEMPLATE
        + "</body></html>"
    )
