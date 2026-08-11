import type { UIMessage } from "ai";

const visibleDataPartTypes = new Set([
  "data-artifactStarted",
  "data-mindMapEditProposed",
  "data-quizEditProposed",
  "data-teachingDocumentEditProposed",
]);

export function assistantMessageHasUserVisibleOutput(message: UIMessage) {
  if (message.role !== "assistant") return false;
  return message.parts.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    return visibleDataPartTypes.has(part.type);
  });
}
