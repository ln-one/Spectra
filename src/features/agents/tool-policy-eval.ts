import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import { createToolCallAccuracyScorerCode } from "@mastra/evals/scorers/prebuilt";

function message(role: "assistant" | "user", toolNames: string[] = []): MastraDBMessage {
  return {
    content: {
      format: 2,
      parts:
        role === "user"
          ? [{ text: "policy case", type: "text" }]
          : toolNames.map((toolName, index) => ({
              toolInvocation: {
                args: {},
                state: "call" as const,
                toolCallId: `call-${index}`,
                toolName,
              },
              type: "tool-invocation" as const,
            })),
    },
    createdAt: new Date(0),
    id: `${role}-policy-message`,
    role,
  };
}

export async function scoreExpectedToolCall(actualToolNames: string[], expectedTool: string) {
  const scorer = createToolCallAccuracyScorerCode({ expectedTool, strictMode: false });
  return scorer.run({
    input: {
      inputMessages: [message("user")],
      rememberedMessages: [],
      systemMessages: [],
      taggedSystemMessages: {},
    },
    output: [message("assistant", actualToolNames)],
  });
}
