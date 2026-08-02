import type { UIMessage } from "ai";

export function assistantMessageHasUserVisibleOutput(message: UIMessage) {
  if (message.role !== "assistant") return false;
  return message.parts.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    return part.type.startsWith("data-");
  });
}
