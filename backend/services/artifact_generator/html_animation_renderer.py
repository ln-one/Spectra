# flake8: noqa: E501
from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

FRAME_WIDTH = 960
FRAME_HEIGHT = 540
FONT_FAMILY_STACK = (
    "'Noto Sans CJK SC', 'WenQuanYi Zen Hei', "
    "'Microsoft YaHei', 'PingFang SC', sans-serif"
)

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

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function easeInOutCubic(t) {
      const x = clamp(t, 0, 1);
      if (x < 0.5) {
        return 4 * x * x * x;
      }
      return 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function easeOutCubic(t) {
      const x = clamp(t, 0, 1);
      return 1 - Math.pow(1 - x, 3);
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

    function countDisplayUnits(char) {
      return /[\\u0000-\\u00ff]/.test(char) ? 0.55 : 1;
    }

    function splitTextLines(text, maxChars, maxLines = Infinity) {
      const content = String(text || "").trim();
      if (!content) {
        return [];
      }
      const chunks = [];
      let current = "";
      let units = 0;
      for (const char of content) {
        const nextUnits = units + countDisplayUnits(char);
        if (current && nextUnits > maxChars) {
          chunks.push(current);
          current = "";
          units = 0;
          if (chunks.length >= maxLines) {
            break;
          }
        }
        current += char;
        units += countDisplayUnits(char);
      }
      if (current && chunks.length < maxLines) {
        chunks.push(current);
      }
      if (chunks.length === maxLines && chunks.join("").length < content.length) {
        const last = chunks[maxLines - 1] || "";
        chunks[maxLines - 1] = `${last.slice(0, Math.max(last.length - 1, 1))}…`;
      }
      return chunks;
    }

    const GENERIC_COPY_NOISE = [
      "整体架构概览",
      "系统演示",
      "流程演示",
      "课堂总结",
      "示意画面",
      "通用说明",
    ];

    function collectSemanticAnchors(spec, scene) {
      const seeds = [spec?.topic, spec?.title, scene?.title, scene?.description];
      if (Array.isArray(spec?.objects)) {
        for (const item of spec.objects.slice(0, 8)) {
          seeds.push(item);
        }
      }
      const anchors = [];
      for (const seed of seeds) {
        const text = String(seed || "").trim();
        if (!text) continue;
        const pieces = text
          .split(/[，,。；;：:\\s、/()（）\\-]+/)
          .map((part) => part.trim());
        for (const piece of pieces) {
          if (piece.length >= 2 && !anchors.includes(piece)) {
            anchors.push(piece);
          }
        }
      }
      return anchors.slice(0, 20);
    }

    function isTeachingRelevantCopy(text, anchors) {
      const value = String(text || "").trim();
      if (!value) return false;
      const hasGenericNoise = GENERIC_COPY_NOISE.some((token) => value.includes(token));
      const hasAnchorMatch = anchors.some((anchor) => value.includes(anchor));
      if (hasAnchorMatch) return true;
      return !hasGenericNoise && value.length >= 6;
    }

    function pickRelevantPoints(points, spec, scene, limit = 3) {
      const anchors = collectSemanticAnchors(spec, scene);
      const resolved = Array.isArray(points) ? points : [];
      const filtered = [];
      for (const item of resolved) {
        const text = String(item || "").trim();
        if (!text) continue;
        if (!isTeachingRelevantCopy(text, anchors)) continue;
        if (!filtered.includes(text)) {
          filtered.push(text);
        }
        if (filtered.length >= limit) break;
      }
      return filtered;
    }

    function resolveBullets(scene, spec, limit = 3) {
      const picked = pickRelevantPoints(scene?.key_points, spec, scene, limit);
      if (picked.length) {
        return picked;
      }
      const description = String(scene?.description || "").trim();
      if (description) {
        return splitTextLines(description, 20, limit).filter(Boolean);
      }
      return [];
    }

    function getTextBlockHeight(text, options = {}) {
      const { lineHeight = 28, maxChars = 18, maxLines = Infinity } = options;
      const lines = splitTextLines(text, maxChars, maxLines);
      if (!lines.length) {
        return 0;
      }
      return (lines.length - 1) * lineHeight + lineHeight;
    }

    function renderTextBlock(x, y, text, options = {}) {
      const {
        fontSize = 18,
        fill = "#10231a",
        lineHeight = 28,
        maxChars = 18,
        maxLines = Infinity,
        fontWeight = 500,
      } = options;
      const lines = splitTextLines(text, maxChars, maxLines);
      if (!lines.length) {
        return "";
      }
      return `
        <text x="${x}" y="${y}" font-family="__FONT_FAMILY_STACK__"
          font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">
          ${lines.map((line, index) => `
            <tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>
          `).join("")}
        </text>
      `;
    }

    function renderChip(x, y, text, fill, stroke, textColor) {
      const chipText = splitTextLines(text, 12, 1)[0] || "";
      const width = Math.max(120, Math.min(240, chipText.length * 14 + 32));
      return `
        <g transform="translate(${x}, ${y})">
          <rect width="${width}" height="36" rx="18" fill="${fill}" stroke="${stroke}" />
          <text x="${width / 2}" y="23" text-anchor="middle"
            font-family="__FONT_FAMILY_STACK__"
            font-size="15" font-weight="700" fill="${textColor}">
            ${escapeHtml(chipText)}
          </text>
        </g>
      `;
    }

    function getSceneMotion(scene, sceneProgress, phase = "steady") {
      const transition = String(scene?.transition || "fade");
      const enter = easeOutCubic(clamp(sceneProgress / 0.22, 0, 1));
      const leave = easeOutCubic(clamp((1 - sceneProgress) / 0.22, 0, 1));
      const blend = phase === "enter" ? enter : (phase === "exit" ? leave : 1);
      const opacity = phase === "steady" ? 1 : (0.82 + 0.18 * blend);
      if (transition === "slide") {
        const shiftDistance = 220;
        const shift = phase === "enter"
          ? (1 - blend) * shiftDistance
          : (phase === "exit" ? -(1 - blend) * shiftDistance : 0);
        return { opacity, offsetX: shift, scale: 1 };
      }
      if (transition === "zoom") {
        const scale = phase === "steady" ? 1 : 0.96 + 0.04 * blend;
        const subtleShift = phase === "enter"
          ? (1 - blend) * 96
          : (phase === "exit" ? -(1 - blend) * 96 : 0);
        return { opacity, offsetX: subtleShift, scale };
      }
      const fadeShift = phase === "enter"
        ? (1 - blend) * 128
        : (phase === "exit" ? -(1 - blend) * 128 : 0);
      return { opacity, offsetX: fadeShift, scale: 1 };
    }

    function wrapSceneBody(body, scene, sceneProgress, options = {}) {
      const phase = String(options.phase || "steady");
      const extraOpacity = clamp(
        Number.isFinite(options.opacity) ? Number(options.opacity) : 1,
        0,
        1
      );
      const motion = getSceneMotion(scene, sceneProgress, phase);
      const cx = 480;
      const cy = 318;
      return `
        <g opacity="${(motion.opacity * extraOpacity).toFixed(3)}"
           transform="translate(${motion.offsetX.toFixed(2)}, 0) translate(${cx}, ${cy}) scale(${motion.scale.toFixed(4)}) translate(${-cx}, ${-cy})">
          ${body}
        </g>
      `;
    }

    function renderHeader(spec, scene, progress) {
      const theme = spec.theme || {};
      const showProgressBar = spec.visual_type !== "process_flow";
      const subtitleText = spec.visual_type === "process_flow"
        ? ""
        : (spec.teaching_goal || spec.summary || "");
      const titleHeight = getTextBlockHeight(spec.title, {
        fontSize: 30,
        lineHeight: 38,
        maxChars: 20,
        maxLines: 2,
      });
      const subtitleY = 92 + titleHeight + 10;
      return `
        <g>
          ${renderTextBlock(88, 92, spec.title, {
            fontSize: 30,
            fill: theme.text,
            lineHeight: 38,
            maxChars: 20,
            maxLines: 2,
            fontWeight: 800,
          })}
          ${renderTextBlock(88, subtitleY, subtitleText, {
            fontSize: 17,
            fill: theme.muted,
            lineHeight: 24,
            maxChars: 34,
            maxLines: 1,
            fontWeight: 500,
          })}
          ${renderChip(88, 24, scene.title || "镜头", withAlpha(theme.accent, 0.10), withAlpha(theme.accent, 0.25), theme.accent_deep)}
          ${showProgressBar ? `
            <g transform="translate(88, 470)">
              <rect width="784" height="16" rx="8" fill="${theme.grid}" />
              <rect width="${Math.max(36, Math.round(784 * clamp(progress, 0, 1)))}" height="16" rx="8" fill="${theme.accent}" />
            </g>
          ` : ""}
        </g>
      `;
    }

    function resolveProcessShot(scene, sceneIndex, sceneCount) {
      const explicit = String(scene?.shot_type || "").toLowerCase();
      if (explicit === "intro" || explicit === "focus" || explicit === "summary") {
        if (explicit === "focus" && sceneCount > 1 && sceneIndex === 0) {
          return "intro";
        }
        if (explicit === "focus" && sceneCount > 1 && sceneIndex === sceneCount - 1) {
          return "summary";
        }
        return explicit;
      }
      const title = String(scene?.title || "");
      if (title.includes("总结") || title.includes("收尾") || title.includes("完成")) {
        return "summary";
      }
      if (sceneIndex <= 0) {
        return "intro";
      }
      if (sceneIndex >= sceneCount - 1) {
        return "summary";
      }
      return "focus";
    }

    function resolveProcessActors(spec) {
      const text = `${spec?.title || ""} ${spec?.topic || ""} ${spec?.summary || ""}`;
      if (text.includes("TCP") || text.includes("握手") || text.includes("连接")) {
        return ["客户端", "服务器"];
      }
      if (text.includes("HTTP") || text.includes("请求") || text.includes("响应")) {
        return ["浏览器", "服务端"];
      }
      if (text.includes("下单") || text.includes("电商")) {
        return ["用户端", "交易服务"];
      }
      return ["起点", "终点"];
    }

    function resolveProcessProtocol(spec, sceneNodes) {
      const content = `${spec?.title || ""} ${spec?.topic || ""} ${spec?.summary || ""} ${(sceneNodes || []).map((item) => item?.title || "").join(" ")}`;
      const upper = content.toUpperCase();
      const isTcpHandshake =
        (upper.includes("TCP") && (content.includes("握手") || upper.includes("SYN") || upper.includes("ACK")))
        || content.includes("三次握手");
      if (isTcpHandshake) {
        return {
          kind: "tcp_handshake",
          steps: [
            {
              id: "syn",
              title: "第一步：发送 SYN",
              packet: "SYN",
              from: "left",
              to: "right",
              left_state: "SYN-SENT",
              right_state: "LISTEN",
            },
            {
              id: "syn_ack",
              title: "第二步：返回 SYN-ACK",
              packet: "SYN+ACK",
              from: "right",
              to: "left",
              left_state: "SYN-RECEIVED",
              right_state: "SYN-RECEIVED",
            },
            {
              id: "ack",
              title: "第三步：确认 ACK",
              packet: "ACK",
              from: "left",
              to: "right",
              left_state: "ESTABLISHED",
              right_state: "ESTABLISHED",
            },
          ],
        };
      }
      return {
        kind: "generic",
        steps: [],
      };
    }

    function resolveTcpHandshakeStepIndex(scene, sceneIndex = 0) {
      const text = `${scene?.title || ""} ${scene?.description || ""}`.toUpperCase();
      if (text.includes("SYN-ACK") || text.includes("SYN+ACK") || text.includes("第二步")) {
        return 1;
      }
      if ((text.includes("ACK") && !text.includes("SYN-ACK") && !text.includes("SYN+ACK")) || text.includes("第三步")) {
        return 2;
      }
      if (text.includes("第一步") || text.includes("SYN")) {
        return 0;
      }
      return Math.max(0, Math.min(2, sceneIndex));
    }

    function renderProcessIntroScene(spec, scene, progress, sceneNodes) {
      const theme = spec.theme || {};
      const protocol = resolveProcessProtocol(spec, sceneNodes);
      if (protocol.kind === "tcp_handshake") {
        const steps = protocol.steps;
        const laneStartX = 236;
        const laneEndX = 724;
        const laneBaseY = 286;
        const laneGap = 54;
        const phase = clamp(progress * Math.max(steps.length, 1), 0, steps.length);
        const lanes = steps.map((item, index) => {
          const laneY = laneBaseY + index * laneGap;
          const forward = item.from === "left";
          const fromX = forward ? laneStartX : laneEndX;
          const toX = forward ? laneEndX : laneStartX;
          const localProgress = clamp(phase - index, 0, 1);
          const eased = easeInOutCubic(localProgress);
          const packetX = lerp(fromX, toX, eased);
          const active = localProgress > 0.01;
          const arrow = forward
            ? "M 694 -8 L 724 0 L 694 8"
            : "M 266 -8 L 236 0 L 266 8";
          return `
            <g opacity="${active ? 1 : 0.28}">
              <line x1="${laneStartX}" y1="${laneY}" x2="${laneEndX}" y2="${laneY}" stroke="${withAlpha(theme.panel, 0.45)}" stroke-width="4" stroke-linecap="round" />
              <path d="${arrow}" transform="translate(0, ${laneY})" fill="none" stroke="${withAlpha(theme.panel, 0.9)}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="${packetX}" cy="${laneY}" r="10" fill="${theme.highlight}" stroke="${withAlpha(theme.accent_deep, 0.72)}" stroke-width="2.5" />
              ${renderTextBlock(forward ? 258 : 528, laneY - 12, item.packet, {
                fontSize: 14,
                fill: withAlpha(theme.panel, 0.95),
                lineHeight: 18,
                maxChars: 10,
                maxLines: 1,
                fontWeight: 700,
              })}
            </g>
          `;
        }).join("");
        return `
          <g>
            <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.accent_deep, 0.9)}" stroke="${withAlpha(theme.panel, 0.25)}" />
            <rect x="96" y="206" width="248" height="228" rx="24" fill="${withAlpha(theme.panel, 0.12)}" stroke="${withAlpha(theme.panel, 0.45)}" />
            <rect x="616" y="206" width="248" height="228" rx="24" fill="${withAlpha(theme.panel, 0.12)}" stroke="${withAlpha(theme.panel, 0.45)}" />
            <text x="220" y="286" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="32" font-weight="800" fill="${withAlpha(theme.panel, 0.96)}">
              客户端
            </text>
            <text x="740" y="286" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="32" font-weight="800" fill="${withAlpha(theme.panel, 0.96)}">
              服务器
            </text>
            <text x="96" y="186" font-family="__FONT_FAMILY_STACK__" font-size="28" font-weight="800" fill="${withAlpha(theme.panel, 0.96)}">
              TCP 三次握手动态预览
            </text>
            ${renderTextBlock(96, 454, scene.description || spec.summary || "", {
              fontSize: 16,
              fill: withAlpha(theme.panel, 0.9),
              lineHeight: 22,
              maxChars: 32,
              maxLines: 1,
              fontWeight: 600,
            })}
            ${lanes}
          </g>
        `;
      }
      const nodeChips = sceneNodes.slice(0, 4).map((item, index) =>
        renderChip(
          118 + index * 186,
          404,
          item.title || `步骤 ${index + 1}`,
          withAlpha(theme.panel, 0.22),
          withAlpha(theme.panel, 0.58),
          withAlpha(theme.panel, 0.98)
        )
      ).join("");
      return `
        <g>
          <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.accent_deep, 0.88)}" stroke="${withAlpha(theme.panel, 0.22)}" />
          <circle cx="${198 + progress * 28}" cy="${262 + progress * 10}" r="84" fill="${withAlpha(theme.highlight, 0.24)}" />
          <circle cx="${786 - progress * 24}" cy="${352 - progress * 8}" r="76" fill="${withAlpha(theme.accent, 0.28)}" />
          <text x="92" y="224" font-family="__FONT_FAMILY_STACK__" font-size="30" font-weight="800" fill="${withAlpha(theme.panel, 0.98)}">
            镜头开场：先看整体流程
          </text>
          ${renderTextBlock(92, 268, scene.description || spec.summary || "", {
            fontSize: 18,
            fill: withAlpha(theme.panel, 0.92),
            lineHeight: 24,
            maxChars: 28,
            maxLines: 2,
            fontWeight: 600,
          })}
          ${nodeChips}
        </g>
      `;
    }

    function renderProcessFocusScene(spec, scene, progress, sceneIndex, sceneNodes) {
      const theme = spec.theme || {};
      const protocol = resolveProcessProtocol(spec, sceneNodes);
      if (protocol.kind === "tcp_handshake") {
        const steps = protocol.steps;
        const stepIndex = resolveTcpHandshakeStepIndex(scene, sceneIndex);
        const step = steps[Math.max(0, Math.min(steps.length - 1, stepIndex))];
        const fromLeft = step.from === "left";
        const fromX = fromLeft ? 244 : 716;
        const toX = fromLeft ? 716 : 244;
        const laneY = 334;
        const packetX = lerp(fromX, toX, easeInOutCubic(progress));
        const pulse = 16 + 10 * Math.abs(Math.sin(progress * Math.PI * 2));
        const bullets = resolveBullets(scene, spec, 1);
        const markerArrow = fromLeft
          ? "M 682 332 L 716 344 L 682 356"
          : "M 278 332 L 244 344 L 278 356";
        const stepChips = steps.map((item, index) =>
          renderChip(
            86 + index * 286,
            160,
            item.title,
            index === stepIndex ? withAlpha(theme.accent, 0.16) : withAlpha(theme.panel, 0.12),
            index === stepIndex ? withAlpha(theme.accent, 0.75) : withAlpha(theme.accent, 0.22),
            index === stepIndex ? theme.accent_deep : theme.text
          )
        ).join("");
        return `
          <g>
            <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.panel, 0.95)}" stroke="${withAlpha(theme.accent, 0.28)}" />
            ${stepChips}
            <rect x="90" y="206" width="264" height="228" rx="24" fill="${withAlpha(theme.panel_alt, 0.94)}" stroke="${withAlpha(theme.accent, 0.28)}" />
            <rect x="606" y="206" width="264" height="228" rx="24" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.30)}" />
            <text x="222" y="278" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="34" font-weight="800" fill="${theme.accent_deep}">
              客户端
            </text>
            <text x="738" y="278" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="34" font-weight="800" fill="${theme.text}">
              服务器
            </text>
            <line x1="244" y1="${laneY}" x2="716" y2="${laneY}" stroke="${withAlpha(theme.accent, 0.45)}" stroke-width="6" stroke-linecap="round" />
            <path d="${markerArrow}" fill="none" stroke="${theme.accent_deep}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="${packetX}" cy="${laneY}" r="${pulse}" fill="${withAlpha(theme.highlight, 0.18)}" />
            <circle cx="${packetX}" cy="${laneY}" r="12" fill="${theme.highlight}" stroke="${withAlpha(theme.accent_deep, 0.75)}" stroke-width="3" />
            ${renderChip(packetX - 74, laneY - 56, step.packet, withAlpha(theme.highlight, 0.2), withAlpha(theme.highlight, 0.6), theme.text)}
            ${renderTextBlock(368, 300, scene.title || step.title, {
              fontSize: 20,
              fill: theme.text,
              lineHeight: 22,
              maxChars: 14,
              maxLines: 1,
              fontWeight: 800,
            })}
            ${renderTextBlock(368, 390, scene.description || "", {
              fontSize: 15,
              fill: theme.muted,
              lineHeight: 20,
              maxChars: 20,
              maxLines: 1,
              fontWeight: 600,
            })}
            ${bullets.map((point, index) => `
              <g transform="translate(368, ${420 + index * 24})">
                <circle cx="0" cy="0" r="4.5" fill="${theme.highlight}" />
                ${renderTextBlock(14, 6, point, {
                  fontSize: 14,
                  fill: theme.text,
                  lineHeight: 18,
                  maxChars: 20,
                  maxLines: 1,
                  fontWeight: 500,
                })}
              </g>
            `).join("")}
            ${renderChip(102, 440, `客户端状态：${step.left_state}`, withAlpha(theme.accent, 0.1), withAlpha(theme.accent, 0.3), theme.accent_deep)}
            ${renderChip(618, 440, `服务器状态：${step.right_state}`, withAlpha(theme.highlight, 0.1), withAlpha(theme.highlight, 0.3), theme.text)}
          </g>
        `;
      }
      const [leftActor, rightActor] = resolveProcessActors(spec);
      const directionLeftToRight = sceneIndex % 2 === 0;
      const laneStartX = directionLeftToRight ? 250 : 710;
      const laneEndX = directionLeftToRight ? 710 : 250;
      const packetX = lerp(laneStartX, laneEndX, easeInOutCubic(progress));
      const laneY = 328;
      const bullets = resolveBullets(scene, spec, 1);
      return `
        <g>
          <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.panel, 0.94)}" stroke="${withAlpha(theme.accent, 0.28)}" />
          <rect x="90" y="204" width="264" height="232" rx="24" fill="${withAlpha(theme.panel_alt, 0.9)}" stroke="${withAlpha(theme.accent, 0.22)}" />
          <rect x="606" y="204" width="264" height="232" rx="24" fill="${withAlpha(theme.highlight, 0.12)}" stroke="${withAlpha(theme.highlight, 0.28)}" />
          <text x="222" y="268" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="28" font-weight="800" fill="${theme.accent_deep}">
            ${escapeHtml(leftActor)}
          </text>
          <text x="738" y="268" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="28" font-weight="800" fill="${theme.text}">
            ${escapeHtml(rightActor)}
          </text>
          <line x1="244" y1="${laneY}" x2="716" y2="${laneY}" stroke="${withAlpha(theme.accent, 0.42)}" stroke-width="6" stroke-linecap="round" />
          <circle cx="${packetX}" cy="${laneY}" r="12" fill="${theme.highlight}" stroke="${withAlpha(theme.accent_deep, 0.72)}" stroke-width="3" />
          <path d="${directionLeftToRight ? "M 686 318 L 716 328 L 686 338" : "M 274 318 L 244 328 L 274 338"}" fill="none" stroke="${theme.accent_deep}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <text x="480" y="298" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="24" font-weight="800" fill="${theme.text}">
            ${escapeHtml(scene.title || `步骤 ${sceneIndex + 1}`)}
          </text>
          ${renderTextBlock(356, 388, scene.description || "", {
            fontSize: 15,
            fill: theme.muted,
            lineHeight: 20,
            maxChars: 20,
            maxLines: 1,
            fontWeight: 600,
          })}
          ${bullets.map((point, index) => `
            <g transform="translate(356, ${418 + index * 24})">
              <circle cx="0" cy="0" r="4.5" fill="${theme.highlight}" />
              ${renderTextBlock(14, 6, point, {
                fontSize: 14,
                fill: theme.text,
                lineHeight: 18,
                maxChars: 20,
                maxLines: 1,
                fontWeight: 500,
              })}
            </g>
          `).join("")}
        </g>
      `;
    }

    function renderProcessSummaryScene(spec, scene, progress, sceneNodes) {
      const theme = spec.theme || {};
      const protocol = resolveProcessProtocol(spec, sceneNodes);
      if (protocol.kind === "tcp_handshake") {
        const stream = (progress * 1.6) % 1;
        const packetA = lerp(248, 712, stream);
        const packetB = lerp(712, 248, (stream + 0.45) % 1);
        const steps = protocol.steps;
        const checklist = steps.map((item, index) => `
          <g transform="translate(132, ${250 + index * 48})">
            <circle cx="0" cy="0" r="11" fill="${withAlpha(theme.accent, 0.2)}" stroke="${theme.accent}" stroke-width="2.6" />
            <path d="M -4 1 L -1 5 L 5 -3" stroke="${theme.accent_deep}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            ${renderTextBlock(22, 6, item.title, {
              fontSize: 16,
              fill: theme.text,
              lineHeight: 20,
              maxChars: 26,
              maxLines: 1,
              fontWeight: 700,
            })}
          </g>
        `).join("");
        return `
          <g>
            <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.panel, 0.95)}" stroke="${withAlpha(theme.accent, 0.2)}" />
            <rect x="84" y="188" width="500" height="276" rx="24" fill="${withAlpha(theme.panel_alt, 0.95)}" stroke="${withAlpha(theme.accent, 0.22)}" />
            <rect x="602" y="188" width="286" height="276" rx="24" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.26)}" />
            <text x="116" y="220" font-family="__FONT_FAMILY_STACK__" font-size="26" font-weight="800" fill="${theme.accent_deep}">
              连接建立完成：进入传输阶段
            </text>
            ${checklist}
            <line x1="248" y1="430" x2="712" y2="430" stroke="${withAlpha(theme.accent, 0.4)}" stroke-width="5" stroke-linecap="round" />
            <circle cx="${packetA}" cy="430" r="8" fill="${theme.highlight}" stroke="${withAlpha(theme.accent_deep, 0.68)}" stroke-width="2" />
            <circle cx="${packetB}" cy="430" r="8" fill="${theme.accent}" stroke="${withAlpha(theme.accent_deep, 0.68)}" stroke-width="2" />
            ${renderChip(180, 438, "状态：ESTABLISHED", withAlpha(theme.accent, 0.14), withAlpha(theme.accent, 0.32), theme.accent_deep)}
            ${renderChip(416, 438, "已进入双向数据传输", withAlpha(theme.highlight, 0.12), withAlpha(theme.highlight, 0.28), theme.text)}
            <text x="630" y="226" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${theme.text}">
              核心知识
            </text>
            ${renderTextBlock(630, 256, scene.description || spec.summary || "", {
              fontSize: 16,
              fill: theme.text,
              lineHeight: 22,
              maxChars: 14,
              maxLines: 4,
              fontWeight: 600,
            })}
          </g>
        `;
      }
      const checklist = sceneNodes.slice(0, 4).map((item, index) => `
        <g transform="translate(132, ${248 + index * 46})">
          <circle cx="0" cy="0" r="11" fill="${withAlpha(theme.accent, 0.2)}" stroke="${theme.accent}" stroke-width="2.6" />
          <path d="M -4 1 L -1 5 L 5 -3" stroke="${theme.accent_deep}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          ${renderTextBlock(22, 6, item.title || `步骤 ${index + 1}`, {
            fontSize: 16,
            fill: theme.text,
            lineHeight: 20,
            maxChars: 24,
            maxLines: 1,
            fontWeight: 700,
          })}
        </g>
      `).join("");
      return `
        <g>
          <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.panel, 0.95)}" stroke="${withAlpha(theme.accent, 0.2)}" />
          <rect x="84" y="188" width="500" height="276" rx="24" fill="${withAlpha(theme.panel_alt, 0.95)}" stroke="${withAlpha(theme.accent, 0.22)}" />
          <rect x="602" y="188" width="286" height="276" rx="24" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.26)}" />
          <text x="116" y="220" font-family="__FONT_FAMILY_STACK__" font-size="26" font-weight="800" fill="${theme.accent_deep}">
            镜头总结：回顾完整链路
          </text>
          ${checklist}
          <text x="630" y="226" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${theme.text}">
            核心知识
          </text>
          ${renderTextBlock(630, 256 + Math.sin(progress * Math.PI * 2) * 2, scene.description || spec.summary || "", {
            fontSize: 16,
            fill: theme.text,
            lineHeight: 22,
            maxChars: 14,
            maxLines: 4,
            fontWeight: 600,
          })}
        </g>
      `;
    }

    function renderProcessFlow(spec, scene, progress, globalProgress, sceneIndex = 0) {
      const scenes = Array.isArray(spec.scenes) && spec.scenes.length > 0
        ? spec.scenes
        : [scene || { title: "步骤 1", description: spec.summary || "" }];
      const shot = resolveProcessShot(scene, sceneIndex, scenes.length);
      if (shot === "intro") {
        return renderProcessIntroScene(spec, scene, progress, scenes);
      }
      if (shot === "summary") {
        return renderProcessSummaryScene(spec, scene, progress, scenes);
      }
      return renderProcessFocusScene(spec, scene, progress, sceneIndex, scenes);
    }

    function renderRelationshipChange(spec, scene, progress) {
      const theme = spec.theme || {};
      const descriptionHeight = getTextBlockHeight(scene.description || "", {
        fontSize: 16,
        lineHeight: 22,
        maxChars: 14,
        maxLines: 3,
      });
      const bulletBaseY = 252 + descriptionHeight + 18;
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
            <text x="${x}" y="428" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="14" fill="${theme.muted}">
              ${index + 1}
            </text>
          </g>
        `;
      }).join("");
      const bullets = resolveBullets(scene, spec, 3).map((point, index) => `
        ${renderTextBlock(690, bulletBaseY + index * 34, `• ${point}`, {
          fontSize: 16,
          fill: theme.text,
          lineHeight: 20,
          maxChars: 14,
          maxLines: 1,
        })}
      `).join("");
      return `
        <g>
          <rect x="64" y="176" width="560" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
          <line x1="118" y1="220" x2="118" y2="392" stroke="${theme.grid}" stroke-width="4" />
          <line x1="118" y1="392" x2="560" y2="392" stroke="${theme.grid}" stroke-width="4" />
          <path d="${path}" fill="none" stroke="${theme.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
          ${dots}
          <rect x="648" y="176" width="248" height="284" rx="32" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.25)}" />
          <text x="690" y="218" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="700" fill="${theme.text}">
            变化解读
          </text>
          ${renderTextBlock(690, 252, scene.description || "", {
            fontSize: 16,
            fill: theme.accent_deep,
            lineHeight: 22,
            maxChars: 14,
            maxLines: 3,
            fontWeight: 600,
          })}
          ${bullets}
        </g>
      `;
    }

    function renderTeacherFigure(x, y, scale, theme, posture = "point") {
      const armPath = posture === "wave"
        ? "M 0 0 C 16 -14 32 -8 44 -22"
        : "M 0 0 C 16 -10 28 -12 42 -6";
      return `
        <g transform="translate(${x}, ${y}) scale(${scale})">
          <ellipse cx="0" cy="74" rx="42" ry="48" fill="${withAlpha(theme.accent, 0.18)}" />
          <circle cx="-2" cy="-2" r="22" fill="${withAlpha(theme.highlight, 0.78)}" />
          <circle cx="-8" cy="-4" r="2.8" fill="${theme.text}" />
          <circle cx="4" cy="-4" r="2.8" fill="${theme.text}" />
          <path d="M -8 10 Q -1 14 8 10" stroke="${theme.accent_deep}" stroke-width="2.2" fill="none" />
          <rect x="-30" y="24" width="58" height="70" rx="22" fill="${withAlpha(theme.panel, 0.9)}" stroke="${withAlpha(theme.accent, 0.35)}" />
          <path d="M -10 48 ${armPath}" stroke="${withAlpha(theme.highlight, 0.95)}" stroke-width="7" stroke-linecap="round" fill="none" />
        </g>
      `;
    }

    function resolveStructureShot(scene, sceneIndex, sceneCount) {
      const explicit = String(scene?.shot_type || "").toLowerCase();
      if (explicit === "intro" || explicit === "focus" || explicit === "summary") {
        return explicit;
      }
      const title = String(scene?.title || "");
      if (title.includes("协作") || title.includes("总结")) {
        return "summary";
      }
      if (
        title.includes("逐层")
        || title.includes("关键")
        || title.includes("展开")
        || sceneIndex === 1
      ) {
        return "focus";
      }
      if (sceneIndex === sceneCount - 1) {
        return "summary";
      }
      if (sceneIndex > 0) {
        return "focus";
      }
      return "intro";
    }

    function renderStructureBreakdown(spec, scene, progress, sceneIndex = 0) {
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
      const sceneCount = Array.isArray(spec.scenes) ? spec.scenes.length : 1;
      const shot = resolveStructureShot(scene, sceneIndex, sceneCount);
      const activeIndex = Math.min(
        Math.max(focusSequence.length - 1, 0),
        Math.floor(progress * Math.max(focusSequence.length, 1))
      );
      const activeLabel = shot === "focus"
        ? focusSequence[activeIndex] || ""
        : "";
      const currentDetail = objectDetails.find((item) => item.label === activeLabel) || objectDetails[0] || {
        label: "整体结构",
        role: scene.description || "",
      };
      const panelTitle = activeLabel || (shot === "summary" ? "层间协作" : "整体结构");
      const panelDescription = shot === "intro"
        ? "先建立整体分层顺序，再理解每层各自负责的通信任务。"
        : (shot === "summary"
          ? "发送时数据自上而下逐层封装，接收时再由下而上逐层还原。"
          : (currentDetail.role || scene.description || ""));
      const bullets = resolveBullets(scene, spec, 3);
      if (shot === "intro") {
        const chips = objects.slice(0, 5).map((item, index) =>
          renderChip(
            186 + index * 144,
            392 + (index % 2) * 40,
            item,
            withAlpha(theme.accent, 0.10),
            withAlpha(theme.accent, 0.24),
            theme.accent_deep
          )
        ).join("");
        const sceneText = renderTextBlock(486, 234, panelDescription, {
          fontSize: 18,
          fill: theme.text,
          lineHeight: 24,
          maxChars: 14,
          maxLines: 4,
          fontWeight: 600,
        });
        return `
          <g>
            <rect x="64" y="176" width="832" height="284" rx="32" fill="${withAlpha(theme.panel, 0.94)}" stroke="${withAlpha(theme.accent, 0.18)}" />
            <rect x="458" y="206" width="402" height="174" rx="28" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.28)}" />
            <text x="486" y="228" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${theme.accent_deep}">
              镜头一：整体全景
            </text>
            ${sceneText}
            <g transform="translate(${604 + (1 - progress) * 30}, ${248 + (1 - progress) * 6}) scale(${0.88 + progress * 0.12})">
              <rect x="-178" y="90" width="356" height="26" rx="6" fill="${withAlpha(theme.accent, 0.22)}" />
              <rect x="-142" y="-12" width="284" height="128" rx="4" fill="${withAlpha(theme.highlight, 0.72)}" stroke="${withAlpha(theme.accent_deep, 0.25)}" />
              <rect x="-70" y="-52" width="140" height="54" rx="6" fill="${withAlpha(theme.highlight, 0.9)}" />
              <polygon points="-84,-12 0,-74 84,-12" fill="${withAlpha(theme.accent_deep, 0.88)}" />
              <rect x="-22" y="46" width="44" height="70" rx="4" fill="${withAlpha(theme.accent_deep, 0.78)}" />
              ${[-120, -80, -40, 40, 80, 120].map((dx) =>
                `<rect x="${dx - 14}" y="20" width="28" height="28" fill="${withAlpha(theme.accent_deep, 0.65)}" />`
              ).join("")}
            </g>
            ${renderTeacherFigure(204 + progress * 12, 272, 1.2, theme, "point")}
            ${chips}
          </g>
        `;
      }

      if (shot === "focus") {
        const packetY = 228 + progress * 168;
        const cameraShift = (progress - 0.5) * 18;
        const maxVisibleCards = 5;
        const cardStart = Math.max(
          0,
          Math.min(
            Math.max(objects.length - maxVisibleCards, 0),
            activeIndex - 2
          )
        );
        const visibleObjects = objects.slice(cardStart, cardStart + maxVisibleCards);
        const packetCardIndex = Math.max(
          0,
          Math.min(maxVisibleCards - 1, activeIndex - cardStart)
        );
        const packetTargetY = 248 + packetCardIndex * 32 + 11;
        const easedPacketY = lerp(packetY, packetTargetY, 0.62);
        const resolvedRole = currentDetail.role
          || (activeLabel ? `${activeLabel}负责该层的核心传输职责。` : "");
        const focusSummary = activeLabel
          ? `当前讲解 ${activeLabel} 的职责与上下层协作方式。`
          : panelDescription;
        const focusFooter = currentDetail.role
          ? `聚焦${panelTitle}：${resolvedRole}`
          : (activeLabel ? `聚焦${activeLabel}：职责与上下层协作。` : "当前层职责强化展示");
        const cards = visibleObjects.map((item, index) => {
          const y = 248 + index * 32;
          const active = item === activeLabel || (!activeLabel && index === 0);
          return `
            <g>
              <rect x="120" y="${y}" width="330" height="22" rx="11" fill="${active ? withAlpha(theme.accent, 0.2) : withAlpha(theme.panel, 0.88)}" stroke="${active ? theme.accent : withAlpha(theme.accent, 0.2)}" stroke-width="${active ? 2.8 : 1.8}" />
              <text x="138" y="${y + 15}" font-family="__FONT_FAMILY_STACK__" font-size="13.5" font-weight="700" fill="${active ? theme.accent_deep : theme.text}">
                ${escapeHtml(item || `层级 ${index + 1}`)}
              </text>
            </g>
          `;
        }).join("");
        return `
          <g transform="translate(${cameraShift}, 0)">
            <rect x="64" y="176" width="832" height="284" rx="32" fill="${withAlpha(theme.panel, 0.94)}" stroke="${withAlpha(theme.accent, 0.22)}" />
            <line x1="468" y1="246" x2="468" y2="414" stroke="${withAlpha(theme.accent, 0.25)}" stroke-width="4" stroke-linecap="round" />
            ${cards}
            <circle cx="468" cy="${easedPacketY}" r="8" fill="${theme.highlight}" stroke="${withAlpha(theme.accent_deep, 0.7)}" stroke-width="2" />
            <path d="M 476 ${easedPacketY} C 512 ${easedPacketY}, 536 ${easedPacketY - 8}, 564 ${easedPacketY - 8}" stroke="${withAlpha(theme.accent, 0.35)}" stroke-width="3" fill="none" stroke-linecap="round" />
            <rect x="564" y="204" width="296" height="220" rx="24" fill="${withAlpha(theme.highlight, 0.08)}" stroke="${withAlpha(theme.highlight, 0.24)}" />
            <text x="606" y="236" font-family="__FONT_FAMILY_STACK__" font-size="20" font-weight="800" fill="${theme.text}">
              当前高亮
            </text>
            <text x="606" y="266" font-family="__FONT_FAMILY_STACK__" font-size="20" font-weight="800" fill="${theme.accent_deep}">
              ${escapeHtml(panelTitle)}
            </text>
            ${renderTextBlock(606, 294, focusSummary, {
              fontSize: 15,
              fill: theme.text,
              lineHeight: 21,
              maxChars: 16,
              maxLines: 3,
              fontWeight: 500,
            })}
            ${renderTextBlock(606, 372, focusFooter, {
              fontSize: 14,
              fill: theme.muted,
              lineHeight: 18,
              maxChars: 16,
              maxLines: 2,
              fontWeight: 600,
            })}
          </g>
        `;
      }

      const summaryY = 284 + Math.sin(progress * Math.PI * 2) * 2.2;
      return `
        <g>
          <rect x="64" y="176" width="832" height="284" rx="32" fill="${withAlpha(theme.panel, 0.94)}" stroke="${withAlpha(theme.accent, 0.2)}" />
          <rect x="110" y="210" width="520" height="192" rx="16" fill="${withAlpha(theme.accent, 0.82)}" />
          <rect x="126" y="226" width="488" height="160" rx="12" fill="${withAlpha(theme.accent, 0.26)}" />
          <text x="142" y="258" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${withAlpha(theme.panel, 0.96)}">
            镜头三：课堂总结
          </text>
          ${renderTextBlock(142, summaryY, panelDescription, {
            fontSize: 18,
            fill: withAlpha(theme.panel, 0.94),
            lineHeight: 24,
            maxChars: 20,
            maxLines: 3,
            fontWeight: 700,
          })}
          ${bullets.slice(0, 2).map((point, index) => `
            <g transform="translate(146, ${334 + index * 30})">
              <circle cx="0" cy="0" r="4.5" fill="${theme.highlight}" />
              ${renderTextBlock(14, 6, point, {
                fontSize: 14,
                fill: withAlpha(theme.panel, 0.92),
                lineHeight: 18,
                maxChars: 20,
                maxLines: 1,
                fontWeight: 600,
              })}
            </g>
          `).join("")}
          ${renderTeacherFigure(722 - progress * 10, 296, 1.32, theme, "wave")}
          <g transform="translate(120, 416)">
            ${renderChip(0, 0, "发送：向下封装", withAlpha(theme.highlight, 0.14), withAlpha(theme.highlight, 0.26), theme.text)}
            ${renderChip(176, 0, "接收：向上解封", withAlpha(theme.panel, 0.16), withAlpha(theme.panel, 0.4), withAlpha(theme.panel, 0.96))}
          </g>
        </g>
      `;
    }

    function renderSceneBodyByType(spec, scene, sceneProgress, globalProgress, sceneIndex) {
      if (spec.visual_type === "relationship_change") {
        return renderRelationshipChange(spec, scene, sceneProgress);
      }
      if (spec.visual_type === "structure_breakdown") {
        return renderStructureBreakdown(spec, scene, sceneProgress, sceneIndex);
      }
      return renderProcessFlow(spec, scene, sceneProgress, globalProgress, sceneIndex);
    }

    function renderFrame(spec, sceneIndex, sceneProgress, globalProgress) {
      const theme = spec.theme || {};
      const scenes = Array.isArray(spec.scenes) && spec.scenes.length > 0 ? spec.scenes : [{ id: "scene-1", title: "镜头 1", description: spec.summary || "" }];
      const safeSceneIndex = clamp(sceneIndex, 0, scenes.length - 1);
      const scene = scenes[safeSceneIndex];
      let body = "";
      const transitionWindow = 0.10;
      const disableCrossSceneBlend = spec.visual_type === "process_flow";
      const shouldBlendFromPrevious =
        !disableCrossSceneBlend && safeSceneIndex > 0 && sceneProgress < transitionWindow;

      if (shouldBlendFromPrevious) {
        const blend = easeInOutCubic(clamp(sceneProgress / transitionWindow, 0, 1));
        const prevOpacity = clamp((0.48 - blend) / 0.48, 0, 1);
        const nextOpacity = clamp((blend - 0.34) / 0.66, 0, 1);
        const previousScene = scenes[safeSceneIndex - 1];
        const previousBody = renderSceneBodyByType(
          spec,
          previousScene,
          1 - blend,
          globalProgress,
          safeSceneIndex - 1
        );
        const currentBody = renderSceneBodyByType(
          spec,
          scene,
          blend,
          globalProgress,
          safeSceneIndex
        );
        body = `
          ${wrapSceneBody(previousBody, previousScene, 1 - blend, {
            phase: "exit",
            opacity: prevOpacity,
          })}
          ${wrapSceneBody(currentBody, scene, blend, {
            phase: "enter",
            opacity: nextOpacity,
          })}
        `;
      } else {
        const steadyBody = renderSceneBodyByType(
          spec,
          scene,
          sceneProgress,
          globalProgress,
          safeSceneIndex
        );
        body = wrapSceneBody(steadyBody, scene, sceneProgress, {
          phase: "steady",
          opacity: 1,
        });
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
""".replace("__FONT_FAMILY_STACK__", FONT_FAMILY_STACK)


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
