export function presentationEditorHref(input: {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
}) {
  return `/presentations/${encodeURIComponent(input.artifactId)}?${new URLSearchParams({
    conversation: input.conversationId,
    workspaceId: input.workspaceId,
  })}`;
}
