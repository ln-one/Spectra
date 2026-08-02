import "server-only";

import type { UIMessage } from "ai";
import { type Database, database } from "@/database/client";
import { loadAiMessagePage } from "@/features/agents/message-records";
import {
  loadWorkspaceConversationPage,
  type WorkspaceConversationPage,
} from "@/features/agents/server";
import type { ArtifactDetail } from "@/features/artifacts/contract";
import { ArtifactError } from "@/features/artifacts/errors";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import {
  canManageArtifactForConversation,
  getArtifactDetailForConversation,
  listArtifactHistory,
} from "@/features/artifacts/workbench-server";
import type { Actor } from "@/features/identity/types";
import { listWorkspaceSources } from "@/features/sources/service";
import type { Source } from "@/features/sources/types";
import {
  type WorkspaceAccessSnapshot,
  workspaceAccessSnapshot,
} from "@/features/workspaces/access.server";
import {
  getWorkspaceSharingState,
  type WorkspaceSharingState,
} from "@/features/workspaces/sharing.server";
import type { Workspace } from "@/features/workspaces/types";
import { webLogger } from "@/observability/server";

export type WorkspaceBootstrap = {
  artifactHistory: ArtifactHistoryItem[];
  conversationId: string;
  conversations: WorkspaceConversationPage;
  initialArtifact: ArtifactDetail | null;
  initialArtifactCanManage: boolean;
  messages: { items: UIMessage[]; nextCursor: string | null };
  sources: Source[];
  sharing: WorkspaceSharingState;
  selectedArtifactMissing: boolean;
};

type ArtifactBootstrap = Pick<
  WorkspaceBootstrap,
  "initialArtifact" | "initialArtifactCanManage" | "selectedArtifactMissing"
>;

async function loadArtifactBootstrap(
  actor: Actor,
  input: {
    access?: WorkspaceAccessSnapshot;
    artifactId: string | null;
    conversationId: string | null;
    workspaceId: string;
  },
  db: Database,
): Promise<ArtifactBootstrap> {
  if (!input.artifactId || !input.conversationId) {
    return {
      initialArtifact: null,
      initialArtifactCanManage: true,
      selectedArtifactMissing: false,
    };
  }
  try {
    const [initialArtifact, initialArtifactCanManage] = await Promise.all([
      getArtifactDetailForConversation(
        actor,
        {
          artifactId: input.artifactId,
          conversationId: input.conversationId,
          workspaceId: input.workspaceId,
        },
        db,
        ...(input.access ? [input.access] : []),
      ),
      canManageArtifactForConversation(
        actor,
        {
          artifactId: input.artifactId,
          conversationId: input.conversationId,
          workspaceId: input.workspaceId,
        },
        db,
        ...(input.access ? [input.access] : []),
      ),
    ]);
    return { initialArtifact, initialArtifactCanManage, selectedArtifactMissing: false };
  } catch (error) {
    if (error instanceof ArtifactError && error.code === "artifact_not_found") {
      return {
        initialArtifact: null,
        initialArtifactCanManage: true,
        selectedArtifactMissing: true,
      };
    }
    throw error;
  }
}

export async function loadWorkspaceBootstrap(input: {
  actor: Actor;
  db?: Database;
  emptyConversationId: string;
  requestedArtifactId: string | null;
  requestedConversationId: string | null;
  workspace: Workspace;
}): Promise<WorkspaceBootstrap> {
  const startedAt = performance.now();
  const db = input.db ?? database;
  const access = workspaceAccessSnapshot(input.workspace);
  const accessInput = access ? { access } : {};
  const conversationPromise = loadWorkspaceConversationPage(
    {
      ...accessInput,
      actor: input.actor,
      emptyConversationId: input.emptyConversationId,
      requestedConversationId: input.requestedConversationId,
      workspace: input.workspace,
    },
    db,
  );
  const sharingPromise = getWorkspaceSharingState(
    input.actor,
    input.workspace.id,
    db,
    ...(access ? [access] : []),
  );
  const sourcesPromise = listWorkspaceSources(input.actor, input.workspace.id, {
    ...accessInput,
    db,
  });
  const artifactHistoryPromise = input.requestedConversationId
    ? listArtifactHistory(
        input.actor,
        {
          conversationId: input.requestedConversationId,
          workspaceId: input.workspace.id,
        },
        db,
        ...(access ? [access] : []),
      )
    : Promise.resolve<ArtifactHistoryItem[]>([]);
  const artifactPromise = loadArtifactBootstrap(
    input.actor,
    {
      ...accessInput,
      artifactId: input.requestedArtifactId,
      conversationId: input.requestedConversationId,
      workspaceId: input.workspace.id,
    },
    db,
  );

  const [conversation, sharingState, initialSources, initialArtifactHistory, artifact] =
    await Promise.all([
      conversationPromise,
      sharingPromise,
      sourcesPromise,
      artifactHistoryPromise,
      artifactPromise,
    ]);
  const parallelReadsFinishedAt = performance.now();
  webLogger.debug(
    {
      event: "workspace.bootstrap.stage.completed",
      stage: "parallel_reads",
      workspaceId: input.workspace.id,
      durationMs: Math.round(parallelReadsFinishedAt - startedAt),
    },
    "Workspace bootstrap parallel reads completed",
  );
  const messagesStartedAt = performance.now();
  const messages = await loadAiMessagePage(
    {
      conversationId: conversation.conversationId,
      workspaceId: input.workspace.id,
    },
    db,
  );
  webLogger.debug(
    {
      durationMs: Math.round(performance.now() - messagesStartedAt),
      event: "workspace.bootstrap.stage.completed",
      stage: "selected_conversation_messages",
      workspaceId: input.workspace.id,
    },
    "Workspace bootstrap message read completed",
  );
  const result = {
    artifactHistory: initialArtifactHistory,
    conversationId: conversation.conversationId,
    conversations: conversation,
    initialArtifact: artifact.initialArtifact,
    initialArtifactCanManage: artifact.initialArtifactCanManage,
    messages,
    sources: initialSources,
    sharing: sharingState,
    selectedArtifactMissing: artifact.selectedArtifactMissing,
  } satisfies WorkspaceBootstrap;
  const payloadBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
  const readCount =
    4 +
    (input.requestedConversationId ? 1 : 0) +
    (input.requestedArtifactId && input.requestedConversationId ? 2 : 0);
  webLogger.info(
    {
      artifactHistoryCount: result.artifactHistory.length,
      conversationCount: result.conversations.items.length,
      durationMs: Math.round(performance.now() - startedAt),
      event: "workspace.bootstrap.completed",
      messageCount: result.messages.items.length,
      payloadBytes,
      readCount,
      sourceCount: result.sources.length,
      workspaceId: input.workspace.id,
    },
    "Workspace bootstrap completed",
  );

  return result;
}
