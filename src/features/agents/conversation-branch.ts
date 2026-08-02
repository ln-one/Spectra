type ConversationBranchMessage = {
  content: { metadata?: Record<string, unknown> };
  id: string;
  role: string;
};

export function currentConversationBranch<Message extends ConversationBranchMessage>(
  messages: readonly Message[],
  succeededRunIds: ReadonlySet<string>,
) {
  let visible: Message[] = [];
  for (const message of messages) {
    const replacement = message.content.metadata?.spectraReplacesTailFromMessageId;
    const runId = message.content.metadata?.spectraRunId;
    if (message.role === "assistant" && typeof runId === "string" && !succeededRunIds.has(runId)) {
      continue;
    }
    if (
      typeof replacement === "string" &&
      typeof runId === "string" &&
      succeededRunIds.has(runId)
    ) {
      const replacedIndex = visible.findIndex((candidate) => candidate.id === replacement);
      if (replacedIndex >= 0) visible = visible.slice(0, replacedIndex);
    }
    visible.push(message);
  }
  return visible;
}
