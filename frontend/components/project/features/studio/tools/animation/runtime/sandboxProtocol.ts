"use client";

import type {
  AnimationCompileError,
  AnimationSandboxInboundEvent,
  AnimationSandboxOutboundMessage,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSandboxInboundEvent(
  value: unknown
): value is AnimationSandboxInboundEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  return (
    value.type === "animation-runtime:ready" ||
    value.type === "animation-runtime:compile-error" ||
    value.type === "animation-runtime:runtime-error" ||
    value.type === "animation-runtime:telemetry"
  );
}

export function isSandboxOutboundMessage(
  value: unknown
): value is AnimationSandboxOutboundMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  return (
    value.type === "animation-runtime:init" ||
    value.type === "animation-runtime:update"
  );
}

export function normalizeSandboxErrors(value: unknown): AnimationCompileError[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((item) => ({
      message:
        typeof item.message === "string" ? item.message : "Unknown runtime error.",
      line: typeof item.line === "number" ? item.line : undefined,
      column: typeof item.column === "number" ? item.column : undefined,
      ruleId: typeof item.ruleId === "string" ? item.ruleId : undefined,
      source: typeof item.source === "string" ? (item.source as AnimationCompileError["source"]) : undefined,
    }));
}
