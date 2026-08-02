export function conversationThreadId(workspaceId: string, conversationId: string) {
  return `workspace:${workspaceId.toLowerCase()}:${conversationId.toLowerCase()}`;
}
