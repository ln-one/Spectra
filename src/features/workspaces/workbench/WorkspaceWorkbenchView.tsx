"use client";

import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import type { ThreadTitleUpdate } from "@/features/agents/thread-events";
import type { ArtifactDetail } from "@/features/artifacts/contract";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import { workspaceHref } from "../address";
import type { WorkspaceSharingState } from "../sharing.server";
import type { Workspace } from "../types";
import type {
  WorkspaceConversationNavigationItem,
  WorkspaceSettingsFormAction,
  WorkspaceThreadDeleteFormAction,
  WorkspaceThreadRenameFormAction,
} from "./types";
import { WorkbenchQueryProvider } from "./WorkbenchQueryProvider";
import { WorkbenchView } from "./WorkbenchView";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";
import { WorkspaceShareDialog } from "./WorkspaceShareDialog";
import { workspaceWorkbenchFixture } from "./workspaceFixture";

export function mergeGeneratedThreadTitle(
  conversations: readonly WorkspaceConversationNavigationItem[],
  conversationId: string,
  generatedTitle: (ThreadTitleUpdate & { updatedAt: string }) | null,
) {
  if (!generatedTitle || generatedTitle.conversationId !== conversationId) return conversations;
  const existing = conversations.find(
    (conversation) => conversation.conversationId === conversationId,
  );
  if (existing?.title && existing.title !== generatedTitle.title) return conversations;
  return [
    {
      conversationId,
      title: generatedTitle.title,
      updatedAt: existing?.updatedAt ?? generatedTitle.updatedAt,
    },
    ...conversations.filter((conversation) => conversation.conversationId !== conversationId),
  ];
}

export function WorkspaceWorkbenchView({
  accountMenu,
  conversationId,
  conversations,
  conversationNextCursor = null,
  deleteThreadAction,
  initialMessages,
  initialMessagesNextCursor = null,
  initialArtifact,
  initialArtifactCanManage = true,
  initialArtifactHistory,
  newConversationId,
  renameThreadAction,
  sharingAction,
  sharingSearchAction,
  sharingState,
  settingsAction,
  sourcesPanel,
  workspace,
  taskAgentCapabilities = ["presentation", "animation"],
  taskAgentCreationCapabilities = taskAgentCapabilities,
}: {
  accountMenu: ReactNode;
  conversationId: string;
  conversations: readonly WorkspaceConversationNavigationItem[];
  conversationNextCursor?: string | null;
  deleteThreadAction: WorkspaceThreadDeleteFormAction;
  initialMessages: readonly UIMessage[];
  initialMessagesNextCursor?: string | null;
  initialArtifact: ArtifactDetail | null;
  initialArtifactCanManage?: boolean;
  initialArtifactHistory: readonly ArtifactHistoryItem[];
  newConversationId: string;
  renameThreadAction: WorkspaceThreadRenameFormAction;
  sharingAction: import("./types").WorkspaceSharingFormAction;
  sharingSearchAction: import("./types").WorkspaceInviteSearchAction;
  sharingState: WorkspaceSharingState;
  settingsAction: WorkspaceSettingsFormAction;
  sourcesPanel: ReactNode;
  workspace: Workspace;
  taskAgentCapabilities?: readonly ("animation" | "presentation")[];
  taskAgentCreationCapabilities?: readonly ("animation" | "presentation")[];
}) {
  const t = useTranslations("Workbench");
  const [generatedTitle, setGeneratedTitle] = useState<
    (ThreadTitleUpdate & { updatedAt: string }) | null
  >(null);
  const visibleConversations = useMemo(
    () => mergeGeneratedThreadTitle(conversations, conversationId, generatedTitle),
    [conversationId, conversations, generatedTitle],
  );
  const fixture = workspaceWorkbenchFixture(
    workspace,
    {
      assistantSubtitle: t("assistantSubtitle"),
      assistantTitle: t("assistantTitle"),
      disclaimer: t("disclaimer"),
      newConversation: t("newConversation"),
      studioSubtitle: t("studioSubtitle"),
      studioTitle: t("studioTitle"),
    },
    initialMessages,
    taskAgentCapabilities,
    taskAgentCreationCapabilities,
  );

  return (
    <WorkbenchQueryProvider>
      <WorkbenchView
        fixture={fixture}
        canPublishArtifacts={Boolean(workspace.permissions?.includes("artifact.publishToSources"))}
        initialArtifact={initialArtifact}
        initialArtifactCanManage={initialArtifactCanManage}
        initialArtifactHistory={initialArtifactHistory}
        accountMenu={accountMenu}
        conversationId={conversationId}
        conversations={visibleConversations}
        conversationNextCursor={conversationNextCursor}
        deleteThreadAction={deleteThreadAction}
        initialMessagesNextCursor={initialMessagesNextCursor}
        newConversationId={newConversationId}
        onThreadTitle={(update) =>
          setGeneratedTitle({ ...update, updatedAt: new Date().toISOString() })
        }
        renameThreadAction={renameThreadAction}
        canManageSettings={Boolean(workspace.permissions?.includes("workspace.manageSettings"))}
        shareControl={
          <WorkspaceShareDialog
            action={sharingAction}
            initialState={sharingState}
            ownerHandle={workspace.ownerHandle}
            searchAction={sharingSearchAction}
            workspaceId={workspace.id}
          />
        }
        settingsAction={settingsAction}
        settingsControl={
          workspace.permissions?.includes("workspace.manageSettings") ? (
            <WorkspaceSettingsDialog
              action={settingsAction}
              conversationId={conversationId}
              workspace={workspace}
            />
          ) : null
        }
        sourcesPanel={sourcesPanel}
        workspaceId={workspace.id}
        workspaceHref={workspaceHref(workspace)}
        workspaceSlug={workspace.slug}
      />
    </WorkbenchQueryProvider>
  );
}
