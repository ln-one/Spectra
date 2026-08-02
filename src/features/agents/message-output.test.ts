import { describe, expect, it } from "vitest";
import { assistantMessageHasUserVisibleOutput } from "./message-output";

function assistant(parts: Array<Record<string, unknown>>) {
  return { id: "assistant:test", parts, role: "assistant" as const };
}

describe("assistant message publication policy", () => {
  it("accepts user-visible text and custom data events", () => {
    expect(
      assistantMessageHasUserVisibleOutput(
        assistant([{ text: "已准备修改提案", type: "text" }]) as never,
      ),
    ).toBe(true);
    expect(
      assistantMessageHasUserVisibleOutput(
        assistant([
          {
            data: { summary: "扩写选中内容" },
            type: "data-teachingDocumentEditProposed",
          },
        ]) as never,
      ),
    ).toBe(true);
  });

  it("rejects blank, tool-only, and validation-error-only messages", () => {
    expect(
      assistantMessageHasUserVisibleOutput(assistant([{ text: "   ", type: "text" }]) as never),
    ).toBe(false);
    expect(
      assistantMessageHasUserVisibleOutput(
        assistant([
          {
            output: { artifacts: [] },
            state: "output-available",
            toolCallId: "call-list",
            toolName: "list_artifacts",
            type: "dynamic-tool",
          },
        ]) as never,
      ),
    ).toBe(false);
    expect(
      assistantMessageHasUserVisibleOutput(
        assistant([
          {
            output: { error: true, message: "cursor must be a number" },
            state: "output-available",
            toolCallId: "call-read",
            toolName: "read_current_artifact",
            type: "dynamic-tool",
          },
        ]) as never,
      ),
    ).toBe(false);
  });
});
