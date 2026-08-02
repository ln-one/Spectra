import { describe, expect, it } from "vitest";
import { currentConversationBranch } from "./conversation-branch";

function message(input: { id: string; role: "assistant" | "user"; runId: string }) {
  return {
    content: { metadata: { spectraRunId: input.runId } },
    id: input.id,
    role: input.role,
  };
}

describe("currentConversationBranch", () => {
  it("hides assistant messages whose Run never passed the publication fence", () => {
    const messages = [
      message({ id: "user:stale", role: "user", runId: "run-stale" }),
      message({ id: "assistant:stale", role: "assistant", runId: "run-stale" }),
      message({ id: "user:ready", role: "user", runId: "run-ready" }),
      message({ id: "assistant:ready", role: "assistant", runId: "run-ready" }),
    ];

    expect(currentConversationBranch(messages, new Set(["run-ready"]))).toEqual([
      messages[0],
      messages[2],
      messages[3],
    ]);
  });
});
