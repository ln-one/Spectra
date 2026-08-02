import type { UIMessage } from "ai";
import type { Workspace } from "../types";
import { STUDIO_TOOL_IDS } from "./studioTools";
import type { WorkspaceWorkbenchFixture } from "./types";

export type WorkspaceWorkbenchCopy = {
  assistantSubtitle: string;
  assistantTitle: string;
  disclaimer: string;
  newConversation: string;
  studioSubtitle: string;
  studioTitle: string;
};

export function workspaceWorkbenchFixture(
  workspace: Workspace,
  copy: WorkspaceWorkbenchCopy,
  initialMessages: readonly UIMessage[] = [],
  publishedCapabilities: readonly ("animation" | "presentation")[] = ["presentation", "animation"],
  creationCapabilities: readonly ("animation" | "presentation")[] = publishedCapabilities,
): WorkspaceWorkbenchFixture {
  const published = new Set(publishedCapabilities);
  const creation = new Set(creationCapabilities);
  return {
    id: workspace.id,
    disclaimer: copy.disclaimer,
    workspace: { workspaceName: workspace.name, threadTitle: copy.newConversation },
    studio: {
      title: copy.studioTitle,
      subtitle: copy.studioSubtitle,
      runtimeUnavailableTools: [
        ...(published.has("presentation") && !creation.has("presentation")
          ? (["smart-slides"] as const)
          : []),
        ...(published.has("animation") && !creation.has("animation")
          ? (["animation"] as const)
          : []),
      ],
      tools: STUDIO_TOOL_IDS.filter(
        (tool) =>
          (tool !== "smart-slides" || published.has("presentation")) &&
          (tool !== "animation" || published.has("animation")),
      ),
    },
    chat: {
      title: copy.assistantTitle,
      subtitle: copy.assistantSubtitle,
      messages: initialMessages,
      selectedSourceCount: 0,
    },
  };
}
