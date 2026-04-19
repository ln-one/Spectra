"use client";

import React from "react";
import { validateRuntimeAst } from "./astValidation";
import { createRuntimeApi } from "./runtimeApi";
import type {
  AnimationCompileError,
  AnimationCompileResult,
  AnimationRuntimeProps,
} from "./types";

const DISALLOWED_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bimport\b/, message: "Imports are not allowed in runtime code." },
  { pattern: /\brequire\s*\(/, message: "require() is not allowed in runtime code." },
  { pattern: /\bfetch\s*\(/, message: "Network access is not allowed in runtime code." },
  { pattern: /\bXMLHttpRequest\b/, message: "XMLHttpRequest is not allowed in runtime code." },
  { pattern: /\bWebSocket\b/, message: "WebSocket is not allowed in runtime code." },
  { pattern: /\bdocument\b/, message: "DOM access is not allowed in runtime code." },
  { pattern: /\bwindow\b/, message: "Window access is not allowed in runtime code." },
  { pattern: /\bglobalThis\b/, message: "globalThis access is not allowed in runtime code." },
  { pattern: /\blocalStorage\b|\bsessionStorage\b/, message: "Storage access is not allowed in runtime code." },
  { pattern: /\beval\s*\(/, message: "eval() is not allowed in runtime code." },
  { pattern: /\bFunction\s*\(/, message: "Function constructor is not allowed in runtime code." },
  { pattern: /\bsetInterval\b|\bsetTimeout\b|\brequestAnimationFrame\b/, message: "Scheduling APIs are not allowed in runtime code." },
  { pattern: /\buseEffect\b|\buseLayoutEffect\b/, message: "Side-effect hooks are not allowed in runtime code." },
];

function error(
  message: string,
  extras?: Partial<AnimationCompileError>
): AnimationCompileResult {
  return { ok: false, component: null, errors: [{ message, ...extras }] };
}

function transformSource(source: string): string {
  const trimmed = source.trim();
  if (!/export\s+default\s+function\s+/m.test(trimmed)) {
    throw new Error("Runtime code must use `export default function ...`.");
  }
  return trimmed.replace(/export\s+default\s+/, "return ");
}

function extractLineColumn(message: string): AnimationCompileError {
  const match = message.match(/<anonymous>:(\d+):(\d+)/);
  return {
    message,
    line: match ? Number.parseInt(match[1] ?? "", 10) : undefined,
    column: match ? Number.parseInt(match[2] ?? "", 10) : undefined,
  };
}

export function compileAnimationComponent(
  source: string,
  options?: { expectedUsedPrimitives?: string[] }
): AnimationCompileResult {
  const trimmed = source.trim();
  if (!trimmed) {
    return error("Runtime code is empty.");
  }

  for (const rule of DISALLOWED_PATTERNS) {
    if (rule.pattern.test(trimmed)) {
      return error(rule.message, {
        ruleId: "text-safety-rule",
        source: "runtime_api",
      });
    }
  }

  const astErrors = validateRuntimeAst(trimmed, options);
  if (astErrors.length > 0) {
    return { ok: false, component: null, errors: astErrors };
  }

  try {
    const transformed = transformSource(trimmed);
    const runtimeApi = createRuntimeApi();
    const evaluator = new Function(
      "__React",
      "__runtimeApi",
      `
        "use strict";
        const {
          motion,
          Stage,
          Scene,
          Node,
          Edge,
          Arrow,
          Label,
          Caption,
          Track,
          Chart,
          Sprite,
          Callout,
          Equation,
          Timeline,
          AnimationGraphRenderer,
          useTimeline,
          usePlayback,
          useSceneState
        } = __runtimeApi;
        const React = __React;
        ${transformed}
      `
    ) as (
      react: typeof React,
      runtimeApi: ReturnType<typeof createRuntimeApi>
    ) => React.ComponentType<AnimationRuntimeProps>;

    const component = evaluator(React, runtimeApi);
    if (typeof component !== "function") {
      return error("Runtime code did not return a React component.");
    }
    return { ok: true, component, errors: [] };
  } catch (compileError) {
    const err =
      compileError instanceof Error
        ? compileError
        : new Error("Unknown runtime compile failure.");
    return {
      ok: false,
      component: null,
      errors: [
        {
          ...extractLineColumn(err.message),
          ruleId: "runtime-eval-error",
          source: "sandbox",
        },
      ],
    };
  }
}
