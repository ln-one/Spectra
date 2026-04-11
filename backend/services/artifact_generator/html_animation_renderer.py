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
      const opacity = phase === "steady" ? 1 : (0.7 + 0.3 * blend);
      if (transition === "slide") {
        const shiftDistance = 72;
        const shift = phase === "enter"
          ? (1 - blend) * shiftDistance
          : (phase === "exit" ? -(1 - blend) * shiftDistance : 0);
        return { opacity, offsetX: shift, scale: 1 };
      }
      if (transition === "zoom") {
        const scale = phase === "steady" ? 1 : 0.985 + 0.015 * blend;
        const subtleShift = phase === "enter"
          ? (1 - blend) * 28
          : (phase === "exit" ? -(1 - blend) * 28 : 0);
        return { opacity, offsetX: subtleShift, scale };
      }
      if (transition === "shutter" || transition === "blinds") {
        return { opacity, offsetX: 0, scale: 1 };
      }
      if (transition === "wipe") {
        const shift = phase === "enter"
          ? (1 - blend) * 48
          : (phase === "exit" ? -(1 - blend) * 48 : 0);
        return { opacity, offsetX: shift, scale: 1 };
      }
      const fadeShift = phase === "enter"
        ? (1 - blend) * 24
        : (phase === "exit" ? -(1 - blend) * 24 : 0);
      return { opacity, offsetX: fadeShift, scale: 1 };
    }

    function resolveSceneCamera(scene, sceneIndex = 0, sceneCount = 1) {
      const explicit = String(scene?.camera || "").trim().toLowerCase();
      if (explicit) {
        return explicit;
      }
      const shot = String(scene?.shot_type || "").trim().toLowerCase();
      if (shot === "intro") {
        return "wide";
      }
      if (shot === "summary") {
        return "zoom_out";
      }
      const focusCameras = ["medium", "close", "track_left", "track_right", "zoom_in"];
      return focusCameras[sceneIndex % focusCameras.length] || "medium";
    }

    function resolveSceneTarget(spec, scene, sceneIndex, sceneCount, sceneProgress) {
      const visualType = String(spec?.visual_type || "process_flow");
      const shot = String(scene?.shot_type || "").trim().toLowerCase();
      if (visualType === "relationship_change") {
        const pointIndex = shot === "summary"
          ? 3
          : (shot === "intro" ? 1 : Math.min(3, Math.floor(sceneProgress * 4)));
        return {
          x: 128 + pointIndex * 130,
          y: 388 - [0.18, 0.34, 0.52, 0.76][pointIndex] * 182,
        };
      }
      if (visualType === "structure_breakdown") {
        if (shot === "intro") {
          return { x: 604, y: 274 };
        }
        if (shot === "summary") {
          return { x: 332, y: 312 };
        }
        const sequence = Array.isArray(scene?.focus_sequence) ? scene.focus_sequence : [];
        const activeIndex = Math.min(
          Math.max(sequence.length - 1, 0),
          Math.floor(sceneProgress * Math.max(sequence.length, 1))
        );
        return {
          x: 292,
          y: 258 + activeIndex * 32,
        };
      }
      const scenes = Array.isArray(spec?.scenes) && spec.scenes.length > 0
        ? spec.scenes
        : [scene || {}];
      const protocol = resolveProcessProtocol(spec, scenes);
      if (protocol.kind === "tcp_handshake" || protocol.kind === "tcp_teardown") {
        const stepIndex = resolveTcpProtocolStepIndex(scene, sceneIndex, protocol);
        const step = protocol.steps[Math.max(0, Math.min(protocol.steps.length - 1, stepIndex))];
        if (shot === "summary") {
          return { x: 480, y: 294 };
        }
        return {
          x: step?.from === "left" ? 620 : 340,
          y: 334,
        };
      }
      if (shot === "intro") {
        return { x: 484, y: 304 };
      }
      if (shot === "summary") {
        return { x: 486, y: 272 };
      }
      return {
        x: sceneIndex % 2 === 0 ? 560 : 402,
        y: 320,
      };
    }

    function getCameraMotion(scene, sceneIndex, sceneCount, sceneProgress, options = {}) {
      const spec = options.spec || {};
      const camera = resolveSceneCamera(scene, sceneIndex, sceneCount);
      const phase = String(options.phase || "steady");
      const blend = phase === "enter"
        ? easeOutCubic(clamp(sceneProgress, 0, 1))
        : (phase === "exit"
          ? easeOutCubic(clamp(1 - sceneProgress, 0, 1))
          : easeInOutCubic(clamp(sceneProgress, 0, 1)));
      const target = resolveSceneTarget(spec, scene, sceneIndex, sceneCount, sceneProgress);
      const drift = Math.sin((sceneProgress + sceneIndex * 0.17) * Math.PI) * 10;
      const lockStrength = {
        wide: 0.18,
        medium: 0.34,
        close: 0.62,
        track_left: 0.52,
        track_right: 0.52,
        zoom_in: 0.58,
        zoom_out: 0.22,
      }[camera] || 0.3;
      const lockX = (480 - target.x) * lockStrength;
      const lockY = (318 - target.y) * lockStrength;
      if (camera === "wide") {
        return { offsetX: lockX, offsetY: lockY - 6 + drift * 0.16, scale: 0.9 + blend * 0.04 };
      }
      if (camera === "medium") {
        return { offsetX: lockX, offsetY: lockY - 8 + drift * 0.2, scale: 0.98 + blend * 0.05 };
      }
      if (camera === "close") {
        return { offsetX: lockX, offsetY: lockY - 10 + drift * 0.22, scale: 1.06 + blend * 0.08 };
      }
      if (camera === "track_left") {
        return { offsetX: lockX + 42 - blend * 56, offsetY: lockY - 5 + drift * 0.18, scale: 1.02 + blend * 0.05 };
      }
      if (camera === "track_right") {
        return { offsetX: lockX - 42 + blend * 56, offsetY: lockY - 5 + drift * 0.18, scale: 1.02 + blend * 0.05 };
      }
      if (camera === "zoom_in") {
        return { offsetX: lockX, offsetY: lockY - 8 + drift * 0.22, scale: 1.02 + blend * 0.1 };
      }
      if (camera === "zoom_out") {
        return { offsetX: lockX, offsetY: lockY - 6 + drift * 0.16, scale: 1.08 - blend * 0.12 };
      }
      return { offsetX: lockX, offsetY: lockY - 6 + drift * 0.18, scale: 1 + blend * 0.05 };
    }

    function wrapSceneBody(body, spec, scene, sceneIndex, sceneCount, sceneProgress, options = {}) {
      const phase = String(options.phase || "steady");
      const extraOpacity = clamp(
        Number.isFinite(options.opacity) ? Number(options.opacity) : 1,
        0,
        1
      );
      const motion = getSceneMotion(scene, sceneProgress, phase);
      const camera = getCameraMotion(scene, sceneIndex, sceneCount, sceneProgress, {
        ...options,
        spec,
      });
      const cx = 480;
      const cy = 318;
      return `
        <g opacity="${(motion.opacity * extraOpacity).toFixed(3)}"
           transform="translate(${(motion.offsetX + camera.offsetX).toFixed(2)}, ${camera.offsetY.toFixed(2)}) translate(${cx}, ${cy}) scale(${(motion.scale * camera.scale).toFixed(4)}) translate(${-cx}, ${-cy})">
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
      const isTcpTeardown =
        (upper.includes("TCP") && (content.includes("四次挥手") || upper.includes("FIN") || upper.includes("TIME_WAIT") || upper.includes("CLOSE_WAIT")))
        || content.includes("四次挥手");
      if (isTcpTeardown) {
        return {
          kind: "tcp_teardown",
          steps: [
            {
              id: "fin_1",
              title: "第一步：发送 FIN",
              packet: "FIN",
              from: "left",
              to: "right",
              left_state: "FIN-WAIT-1",
              right_state: "ESTABLISHED",
            },
            {
              id: "ack_1",
              title: "第二步：返回 ACK",
              packet: "ACK",
              from: "right",
              to: "left",
              left_state: "FIN-WAIT-2",
              right_state: "CLOSE-WAIT",
            },
            {
              id: "fin_2",
              title: "第三步：发送 FIN",
              packet: "FIN",
              from: "right",
              to: "left",
              left_state: "FIN-WAIT-2",
              right_state: "LAST-ACK",
            },
            {
              id: "ack_2",
              title: "第四步：确认 ACK",
              packet: "ACK",
              from: "left",
              to: "right",
              left_state: "TIME-WAIT",
              right_state: "CLOSED",
            },
          ],
        };
      }
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

    function resolveTcpProtocolStepIndex(scene, sceneIndex = 0, protocol = null) {
      const text = `${scene?.title || ""} ${scene?.description || ""}`.toUpperCase();
      if (protocol?.kind === "tcp_teardown") {
        if (text.includes("第四步") || text.includes("TIME-WAIT") || text.includes("TIME_WAIT")) {
          return 3;
        }
        if (text.includes("第三步") || (text.includes("FIN") && (text.includes("服务端") || text.includes("被动关闭")))) {
          return 2;
        }
        if (text.includes("第二步") || (text.includes("ACK") && !text.includes("FIN"))) {
          return 1;
        }
        if (text.includes("第一步") || text.includes("FIN")) {
          return 0;
        }
        return Math.max(0, Math.min(3, sceneIndex));
      }
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
      if (protocol.kind === "tcp_handshake" || protocol.kind === "tcp_teardown") {
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
              ${protocol.kind === "tcp_teardown" ? "TCP 四次挥手动态预览" : "TCP 三次握手动态预览"}
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
      if (protocol.kind === "tcp_handshake" || protocol.kind === "tcp_teardown") {
        const steps = protocol.steps;
        const stepIndex = resolveTcpProtocolStepIndex(scene, sceneIndex, protocol);
        const step = steps[Math.max(0, Math.min(steps.length - 1, stepIndex))];
        const fromLeft = step.from === "left";
        const fromX = fromLeft ? 244 : 716;
        const toX = fromLeft ? 716 : 244;
        const laneY = 334;
        const travel = easeInOutCubic(progress);
        const packetX = lerp(fromX, toX, travel);
        const pulse = 16 + 10 * Math.abs(Math.sin(progress * Math.PI * 2));
        const sourcePanelPulse = 0.08 + 0.08 * Math.abs(Math.sin(progress * Math.PI * 2));
        const sinkPanelPulse = 0.06 + 0.05 * Math.abs(Math.sin((progress + 0.3) * Math.PI * 2));
        const dashOffset = (1 - progress) * 42;
        const trail = [0.08, 0.16, 0.24].map((offset, index) => {
          const ratio = clamp(travel - offset, 0, 1);
          const x = lerp(fromX, toX, ratio);
          const alpha = 0.28 - index * 0.07;
          const radius = 9 - index * 1.5;
          return `
            <circle cx="${x}" cy="${laneY}" r="${radius}" fill="${withAlpha(theme.highlight, alpha)}" />
          `;
        }).join("");
        const bullets = resolveBullets(scene, spec, 1);
        const markerArrow = fromLeft
          ? "M 682 332 L 716 344 L 682 356"
          : "M 278 332 L 244 344 L 278 356";
        const chipStartX = 54;
        const chipGap = steps.length > 1 ? Math.floor(660 / (steps.length - 1)) : 0;
        const stepChips = steps.map((item, index) =>
          renderChip(
            chipStartX + index * chipGap,
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
            <rect x="90" y="206" width="264" height="228" rx="24" fill="${withAlpha(theme.panel_alt, fromLeft ? 0.86 + sourcePanelPulse : 0.90)}" stroke="${withAlpha(theme.accent, fromLeft ? 0.34 + sourcePanelPulse : 0.24)}" />
            <rect x="606" y="206" width="264" height="228" rx="24" fill="${withAlpha(theme.highlight, fromLeft ? 0.10 + sinkPanelPulse : 0.14 + sourcePanelPulse)}" stroke="${withAlpha(theme.highlight, fromLeft ? 0.26 + sinkPanelPulse : 0.36 + sourcePanelPulse)}" />
            <text x="222" y="278" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="34" font-weight="800" fill="${theme.accent_deep}">
              客户端
            </text>
            <text x="738" y="278" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="34" font-weight="800" fill="${theme.text}">
              服务器
            </text>
            <line x1="244" y1="${laneY}" x2="716" y2="${laneY}" stroke="${withAlpha(theme.accent, 0.45)}" stroke-width="6" stroke-linecap="round" />
            <line x1="244" y1="${laneY}" x2="716" y2="${laneY}" stroke="${withAlpha(theme.highlight, 0.58)}" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="18 14" stroke-dashoffset="${dashOffset}" />
            <path d="${markerArrow}" fill="none" stroke="${theme.accent_deep}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
            ${trail}
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
      const focusVariant = sceneIndex % 2 === 0 ? "spotlight" : "storyboard";
      const directionLeftToRight = sceneIndex % 2 === 0;
      const laneStartX = directionLeftToRight ? 250 : 710;
      const laneEndX = directionLeftToRight ? 710 : 250;
      const packetX = lerp(laneStartX, laneEndX, easeInOutCubic(progress));
      const laneY = 328;
      const bullets = resolveBullets(scene, spec, 1);
      if (focusVariant === "storyboard") {
        const activeCardX = 114 + Math.sin(progress * Math.PI) * 10;
        const detailWidth = 332 + Math.sin(progress * Math.PI) * 8;
        return `
          <g>
            <rect x="32" y="146" width="896" height="364" rx="36" fill="${withAlpha(theme.accent_deep, 0.92)}" stroke="${withAlpha(theme.panel, 0.22)}" />
            <rect x="88" y="188" width="300" height="274" rx="26" fill="${withAlpha(theme.panel, 0.96)}" stroke="${withAlpha(theme.accent, 0.24)}" />
            <rect x="430" y="188" width="${detailWidth}" height="274" rx="28" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.26)}" />
            <rect x="${activeCardX}" y="220" width="248" height="184" rx="22" fill="${withAlpha(theme.panel_alt, 0.92)}" stroke="${withAlpha(theme.accent, 0.28)}" />
            <text x="138" y="252" font-family="__FONT_FAMILY_STACK__" font-size="18" font-weight="700" fill="${theme.muted}">
              当前镜头
            </text>
            ${renderTextBlock(138, 286, scene.title || `步骤 ${sceneIndex + 1}`, {
              fontSize: 24,
              fill: theme.accent_deep,
              lineHeight: 28,
              maxChars: 12,
              maxLines: 2,
              fontWeight: 800,
            })}
            ${renderTextBlock(138, 356, scene.description || "", {
              fontSize: 15,
              fill: theme.text,
              lineHeight: 20,
              maxChars: 14,
              maxLines: 3,
              fontWeight: 500,
            })}
            <g transform="translate(460, 222)">
              ${sceneNodes.slice(0, 5).map((item, index) => `
                <g transform="translate(${index * 78}, ${index % 2 === 0 ? 0 : 42})">
                  <circle cx="18" cy="18" r="${item.id === scene.id ? 20 : 15}" fill="${item.id === scene.id ? theme.highlight : withAlpha(theme.panel, 0.22)}" stroke="${item.id === scene.id ? withAlpha(theme.panel, 0.9) : withAlpha(theme.panel, 0.45)}" stroke-width="2.4" />
                  <text x="18" y="23" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="13" font-weight="800" fill="${item.id === scene.id ? theme.text : withAlpha(theme.panel, 0.96)}">
                    ${index + 1}
                  </text>
                  <line x1="38" y1="18" x2="70" y2="18" stroke="${withAlpha(theme.panel, 0.35)}" stroke-width="3" stroke-linecap="round" />
                </g>
              `).join("")}
            </g>
            <text x="460" y="330" font-family="__FONT_FAMILY_STACK__" font-size="21" font-weight="800" fill="${withAlpha(theme.panel, 0.96)}">
              分镜细节页
            </text>
            ${bullets.map((point, index) => `
              <g transform="translate(462, ${360 + index * 28})">
                <circle cx="0" cy="0" r="4.5" fill="${theme.highlight}" />
                ${renderTextBlock(14, 6, point, {
                  fontSize: 14,
                  fill: withAlpha(theme.panel, 0.95),
                  lineHeight: 18,
                  maxChars: 22,
                  maxLines: 1,
                  fontWeight: 600,
                })}
              </g>
            `).join("")}
          </g>
        `;
      }
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
          <line x1="244" y1="${laneY}" x2="716" y2="${laneY}" stroke="${withAlpha(theme.highlight, 0.55)}" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="18 14" stroke-dashoffset="${(1 - progress) * 42}" />
          <circle cx="${packetX}" cy="${laneY}" r="34" fill="${withAlpha(theme.highlight, 0.12)}" />
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

    function resolveRelationshipShot(scene, sceneIndex, sceneCount) {
      const explicit = String(scene?.shot_type || "").toLowerCase();
      if (explicit === "intro" || explicit === "focus" || explicit === "summary") {
        return explicit;
      }
      const title = String(scene?.title || "");
      if (title.includes("总结") || title.includes("结论")) {
        return "summary";
      }
      if (sceneIndex <= 0 || title.includes("先看") || title.includes("引入")) {
        return "intro";
      }
      if (sceneIndex >= sceneCount - 1) {
        return "summary";
      }
      return "focus";
    }

    function renderRelationshipChange(spec, scene, progress, sceneIndex = 0) {
      const theme = spec.theme || {};
      const scenes = Array.isArray(spec.scenes) && spec.scenes.length > 0
        ? spec.scenes
        : [scene || { title: "镜头 1", description: spec.summary || "" }];
      const shot = resolveRelationshipShot(scene, sceneIndex, scenes.length);
      const descriptionHeight = getTextBlockHeight(scene.description || "", {
        fontSize: 16,
        lineHeight: 22,
        maxChars: 14,
        maxLines: 3,
      });
      const bulletBaseY = 252 + descriptionHeight + 18;
      const basePoints = [0.18, 0.34, 0.52, 0.76];
      const points = basePoints.map((value, index) => {
        if (shot === "intro") {
          return value - 0.03 + progress * 0.04 * index;
        }
        if (shot === "summary") {
          return value + 0.03 * index - progress * 0.02;
        }
        return value + (index === 2 ? progress * 0.16 : Math.sin((progress + index * 0.12) * Math.PI) * 0.03);
      });
      const path = points.map((value, index) => {
        const x = 128 + index * 130;
        const y = 388 - value * 182;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ");
      const dots = points.map((value, index) => {
        const x = 128 + index * 130;
        const y = 388 - value * 182;
        const activeIndex = shot === "focus"
          ? Math.min(points.length - 1, Math.floor(progress * points.length))
          : (shot === "summary" ? points.length - 1 : 0);
        const active = index === activeIndex;
        return `
          <g>
            <circle cx="${x}" cy="${y}" r="${active ? 16 : 10}" fill="${active ? theme.highlight : theme.accent}" />
            <circle cx="${x}" cy="${y}" r="${active ? 26 + Math.sin(progress * Math.PI * 2) * 3 : 0}" fill="${withAlpha(theme.highlight, active ? 0.16 : 0)}" />
            <text x="${x}" y="428" text-anchor="middle" font-family="__FONT_FAMILY_STACK__" font-size="14" fill="${theme.muted}">
              ${index + 1}
            </text>
          </g>
        `;
      }).join("");
      const trendLabel = shot === "intro"
        ? "先建立整体趋势"
        : (shot === "summary" ? "回收到教学结论" : "放大关键转折");
      const bullets = resolveBullets(scene, spec, 3).map((point, index) => `
        ${renderTextBlock(690, bulletBaseY + index * 34, `• ${point}`, {
          fontSize: 16,
          fill: theme.text,
          lineHeight: 20,
          maxChars: 14,
          maxLines: 1,
        })}
      `).join("");
      if (shot === "intro") {
        return `
          <g>
            <rect x="64" y="176" width="832" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
            <rect x="96" y="206" width="468" height="208" rx="24" fill="${withAlpha(theme.panel_alt, 0.72)}" />
            <line x1="128" y1="238" x2="128" y2="392" stroke="${theme.grid}" stroke-width="4" />
            <line x1="128" y1="392" x2="532" y2="392" stroke="${theme.grid}" stroke-width="4" />
            <path d="${path}" fill="none" stroke="${theme.accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
            ${dots}
            <rect x="602" y="206" width="258" height="208" rx="28" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.25)}" />
            <text x="636" y="242" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${theme.accent_deep}">
              镜头一：趋势全景
            </text>
            ${renderTextBlock(636, 278, scene.description || "", {
              fontSize: 16,
              fill: theme.text,
              lineHeight: 22,
              maxChars: 14,
              maxLines: 3,
              fontWeight: 600,
            })}
            ${renderChip(636, 356, trendLabel, withAlpha(theme.accent, 0.12), withAlpha(theme.accent, 0.26), theme.accent_deep)}
            ${renderTeacherFigure(796 - progress * 10, 314, 1.18, theme, "point")}
          </g>
        `;
      }

      if (shot === "focus") {
        const activeIndex = Math.min(points.length - 1, Math.floor(progress * points.length));
        const zoomX = 128 + activeIndex * 130;
        const zoomY = 388 - points[activeIndex] * 182;
        return `
          <g>
            <rect x="64" y="176" width="832" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
            <rect x="86" y="196" width="396" height="244" rx="26" fill="${withAlpha(theme.panel_alt, 0.54)}" />
            <g transform="translate(${(0.5 - progress) * 24}, ${(0.5 - progress) * 6})">
              <line x1="120" y1="230" x2="120" y2="392" stroke="${theme.grid}" stroke-width="4" />
              <line x1="120" y1="392" x2="450" y2="392" stroke="${theme.grid}" stroke-width="4" />
              <path d="${path}" fill="none" stroke="${theme.accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
              ${dots}
              <circle cx="${zoomX}" cy="${zoomY}" r="42" fill="${withAlpha(theme.highlight, 0.18)}" />
              <circle cx="${zoomX}" cy="${zoomY}" r="24" fill="none" stroke="${withAlpha(theme.highlight, 0.9)}" stroke-width="4" />
            </g>
            <rect x="520" y="200" width="340" height="232" rx="28" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.26)}" />
            <text x="556" y="236" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${theme.text}">
              镜头二：关键转折
            </text>
            ${renderTextBlock(556, 272, scene.description || "", {
              fontSize: 16,
              fill: theme.accent_deep,
              lineHeight: 22,
              maxChars: 16,
              maxLines: 3,
              fontWeight: 700,
            })}
            ${bullets}
            <g transform="translate(560, 376)">
              ${renderChip(0, 0, "放大局部波峰/波谷", withAlpha(theme.highlight, 0.14), withAlpha(theme.highlight, 0.26), theme.text)}
            </g>
          </g>
        `;
      }

      return `
        <g>
          <rect x="64" y="176" width="832" height="284" rx="32" fill="${theme.panel}" stroke="${withAlpha(theme.accent, 0.20)}" />
          <rect x="98" y="208" width="436" height="220" rx="28" fill="${withAlpha(theme.accent, 0.86)}" />
          <path d="${path}" fill="none" stroke="${withAlpha(theme.panel, 0.92)}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
          ${dots}
          <text x="132" y="244" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${withAlpha(theme.panel, 0.96)}">
            镜头三：规律结论
          </text>
          ${renderTextBlock(132, 282, scene.description || "", {
            fontSize: 17,
            fill: withAlpha(theme.panel, 0.94),
            lineHeight: 24,
            maxChars: 20,
            maxLines: 3,
            fontWeight: 700,
          })}
          <rect x="568" y="208" width="292" height="220" rx="28" fill="${withAlpha(theme.highlight, 0.10)}" stroke="${withAlpha(theme.highlight, 0.25)}" />
          <text x="604" y="244" font-family="__FONT_FAMILY_STACK__" font-size="22" font-weight="800" fill="${theme.text}">
            教学收束
          </text>
          ${bullets}
          ${renderTeacherFigure(804 - progress * 8, 314, 1.24, theme, "wave")}
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
        return renderRelationshipChange(spec, scene, sceneProgress, sceneIndex);
      }
      if (spec.visual_type === "structure_breakdown") {
        return renderStructureBreakdown(spec, scene, sceneProgress, sceneIndex);
      }
      return renderProcessFlow(spec, scene, sceneProgress, globalProgress, sceneIndex);
    }

    function renderCinematicOverlay(spec, scene, sceneProgress, phase = "steady", globalProgress = 0) {
      const theme = spec.theme || {};
      const shot = String(scene?.shot_type || "").toLowerCase();
      const sweep = phase === "enter"
        ? easeOutCubic(clamp(sceneProgress, 0, 1))
        : (phase === "exit"
          ? easeOutCubic(clamp(1 - sceneProgress, 0, 1))
          : easeInOutCubic(clamp(sceneProgress, 0, 1)));
      const bandX = lerp(-180, WIDTH + 180, sweep);
      const bandOpacity = phase === "steady" ? 0.035 : 0.07;
      const vignetteOpacity = shot === "summary" ? 0.045 : 0.03;
      const cropInset = shot === "focus" ? 18 : 10;
      const parallax = (globalProgress - 0.5) * 42;
      return `
        <g pointer-events="none">
          <rect width="${WIDTH}" height="${HEIGHT}" fill="${withAlpha(theme.accent_deep, vignetteOpacity)}" opacity="0.12" />
          <rect x="0" y="0" width="${cropInset}" height="${HEIGHT}" fill="${withAlpha(theme.panel, 0.06)}" />
          <rect x="${WIDTH - cropInset}" y="0" width="${cropInset}" height="${HEIGHT}" fill="${withAlpha(theme.panel, 0.06)}" />
          <rect x="${bandX}" y="-20" width="108" height="${HEIGHT + 40}" fill="${withAlpha(theme.highlight, bandOpacity)}" transform="rotate(9 ${bandX} 0)" />
          <ellipse cx="${144 + parallax}" cy="${126 + Math.sin(globalProgress * Math.PI * 2) * 8}" rx="52" ry="26" fill="${withAlpha(theme.panel, 0.045)}" />
          <ellipse cx="${WIDTH - 156 - parallax}" cy="${HEIGHT - 104}" rx="64" ry="30" fill="${withAlpha(theme.highlight, 0.035)}" />
        </g>
      `;
    }

    function renderTransitionOverlay(spec, scene, sceneProgress, phase = "steady") {
      if (phase === "steady") {
        return "";
      }
      const theme = spec.theme || {};
      const transition = String(scene?.transition || "fade");
      const blend = phase === "enter"
        ? easeOutCubic(clamp(sceneProgress / 0.22, 0, 1))
        : easeOutCubic(clamp((1 - sceneProgress) / 0.22, 0, 1));
      const veilOpacity = (1 - blend) * 0.22;
      if (transition === "blinds") {
        const slatCount = 6;
        const slatHeight = HEIGHT / slatCount;
        return `
          <g pointer-events="none" opacity="${clamp((1 - blend) * 0.82, 0, 1).toFixed(3)}">
            ${Array.from({ length: slatCount }).map((_, index) => {
              const width = Math.round(WIDTH * (phase === "enter" ? 1 - blend : blend));
              const x = phase === "enter" ? 0 : WIDTH - width;
              const y = Math.round(index * slatHeight);
              return `<rect x="${x}" y="${y}" width="${width}" height="${Math.ceil(slatHeight - 2)}" fill="${withAlpha(theme.panel, 0.16)}" />`;
            }).join("")}
          </g>
        `;
      }
      if (transition === "shutter") {
        const curtain = Math.round((1 - blend) * WIDTH * 0.26);
        return `
          <g pointer-events="none">
            <rect x="0" y="0" width="${curtain}" height="${HEIGHT}" fill="${withAlpha(theme.panel, 0.18)}" />
            <rect x="${WIDTH - curtain}" y="0" width="${curtain}" height="${HEIGHT}" fill="${withAlpha(theme.panel, 0.18)}" />
            <rect x="${Math.round(WIDTH * 0.5 - 1)}" y="0" width="2" height="${HEIGHT}" fill="${withAlpha(theme.panel, 0.12)}" opacity="${clamp(1 - blend, 0, 1).toFixed(3)}" />
          </g>
        `;
      }
      if (transition === "wipe") {
        const wipeWidth = Math.round((1 - blend) * 140);
        const x = phase === "enter" ? Math.round((1 - blend) * WIDTH) : Math.round(blend * WIDTH);
        return `
          <g pointer-events="none">
            <rect x="${x - wipeWidth}" y="0" width="${wipeWidth}" height="${HEIGHT}" fill="${withAlpha(theme.highlight, 0.12)}" />
          </g>
        `;
      }
      return `
        <g pointer-events="none">
          <rect width="${WIDTH}" height="${HEIGHT}" fill="${withAlpha(theme.panel, 0.14)}" opacity="${veilOpacity.toFixed(3)}" />
        </g>
      `;
    }

    function renderFrame(spec, sceneIndex, sceneProgress, globalProgress) {
      const theme = spec.theme || {};
      const scenes = Array.isArray(spec.scenes) && spec.scenes.length > 0 ? spec.scenes : [{ id: "scene-1", title: "镜头 1", description: spec.summary || "" }];
      const safeSceneIndex = clamp(sceneIndex, 0, scenes.length - 1);
      const scene = scenes[safeSceneIndex];
      let body = "";
      const transitionWindow = 0.16;
      const disableCrossSceneBlend = scenes.length <= 1;
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
            ${wrapSceneBody(previousBody, spec, previousScene, safeSceneIndex - 1, scenes.length, 1 - blend, {
              phase: "exit",
              opacity: prevOpacity,
            })}
            ${wrapSceneBody(currentBody, spec, scene, safeSceneIndex, scenes.length, blend, {
              phase: "enter",
              opacity: nextOpacity,
            })}
            ${renderTransitionOverlay(spec, scene, sceneProgress, "enter")}
          `;
        } else {
        const steadyBody = renderSceneBodyByType(
          spec,
          scene,
          sceneProgress,
          globalProgress,
          safeSceneIndex
        );
        body = wrapSceneBody(steadyBody, spec, scene, safeSceneIndex, scenes.length, sceneProgress, {
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
          <circle cx="${816 - sceneProgress * 18}" cy="${104 + sceneProgress * 8}" r="${32 + sceneProgress * 18}" fill="${withAlpha(theme.highlight, 0.16)}" />
          <circle cx="${748 + sceneProgress * 12}" cy="${436 - sceneProgress * 10}" r="${54 - sceneProgress * 10}" fill="${withAlpha(theme.accent, 0.08)}" />
          <ellipse cx="${138 + globalProgress * 68}" cy="${428 - globalProgress * 24}" rx="94" ry="34" fill="${withAlpha(theme.panel, 0.10)}" />
            ${renderHeader(spec, scene, globalProgress)}
            ${body}
            ${renderCinematicOverlay(spec, scene, sceneProgress, shouldBlendFromPrevious ? "enter" : "steady", globalProgress)}
            ${renderTransitionOverlay(spec, scene, sceneProgress, shouldBlendFromPrevious ? "enter" : "steady")}
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
    total_frames = max(len(scenes) * 10, min(duration_seconds * fps, 160))
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
