import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/database/client";
import { loadAiMessagePage } from "@/features/agents/message-records";
import { loadWorkspaceConversationPage } from "@/features/agents/server";
import {
  canManageArtifactForConversation,
  getArtifactDetailForConversation,
  listArtifactHistory,
} from "@/features/artifacts/workbench-server";
import { listWorkspaceSources } from "@/features/sources/service";
import { getWorkspaceSharingState } from "@/features/workspaces/sharing.server";
import type { Workspace } from "@/features/workspaces/types";
import { webLogger } from "@/observability/server";
import { loadWorkspaceBootstrap } from "./bootstrap.server";

vi.mock("@/features/agents/message-records", () => ({ loadAiMessagePage: vi.fn() }));
vi.mock("@/features/agents/server", () => ({ loadWorkspaceConversationPage: vi.fn() }));
vi.mock("@/features/artifacts/workbench-server", () => ({
  canManageArtifactForConversation: vi.fn(),
  getArtifactDetailForConversation: vi.fn(),
  listArtifactHistory: vi.fn(),
}));
vi.mock("@/features/sources/service", () => ({ listWorkspaceSources: vi.fn() }));
vi.mock("@/features/workspaces/sharing.server", () => ({ getWorkspaceSharingState: vi.fn() }));
vi.mock("@/observability/server", () => ({
  webLogger: { debug: vi.fn(), info: vi.fn() },
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000801" };
const workspace: Workspace = {
  archivedAt: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000802",
  name: "Workbench",
  ownerHandle: "alice",
  ownerId: actor.principalId,
  permissions: ["workspace.read", "workspace.chat", "artifact.private.manage", "source.manage"],
  slug: null,
  updatedAt: "2026-08-02T00:00:00.000Z",
  visibility: "private" as const,
};
const conversationId = "00000000-0000-4000-8000-000000000803";
const artifactId = "00000000-0000-4000-8000-000000000804";

beforeEach(() => {
  vi.mocked(loadWorkspaceConversationPage)
    .mockReset()
    .mockResolvedValue({
      conversationId,
      items: [{ conversationId, title: "First", updatedAt: "2026-08-02T00:00:00.000Z" }],
      nextCursor: "conversation-cursor",
    });
  vi.mocked(loadAiMessagePage)
    .mockReset()
    .mockResolvedValue({
      items: [{ id: "message-1", parts: [{ text: "Hello", type: "text" }], role: "user" }],
      nextCursor: "message-cursor",
    });
  vi.mocked(getWorkspaceSharingState).mockReset().mockResolvedValue({
    canManage: true,
    firstSharedAt: null,
    members: [],
    referenceable: false,
    slug: null,
    visibility: "private",
  });
  vi.mocked(listWorkspaceSources).mockReset().mockResolvedValue([]);
  vi.mocked(listArtifactHistory).mockReset().mockResolvedValue([]);
  vi.mocked(getArtifactDetailForConversation)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(canManageArtifactForConversation).mockReset().mockResolvedValue(true);
  vi.mocked(webLogger.debug).mockReset();
  vi.mocked(webLogger.info).mockReset();
});

describe("Workspace bootstrap read model", () => {
  it("returns serializable read DTOs and records stable stage metrics", async () => {
    const result = await loadWorkspaceBootstrap({
      actor,
      db: {} as Database,
      emptyConversationId: conversationId,
      requestedArtifactId: null,
      requestedConversationId: null,
      workspace,
    });

    expect(result).toMatchObject({
      conversationId,
      conversations: { items: [{ conversationId }], nextCursor: "conversation-cursor" },
      messages: { items: [{ id: "message-1" }], nextCursor: "message-cursor" },
      sources: [],
      sharing: { visibility: "private" },
    });
    expect(result).not.toHaveProperty("actor");
    expect(result).not.toHaveProperty("permissions");
    expect(getWorkspaceSharingState).toHaveBeenCalledWith(
      actor,
      workspace.id,
      expect.anything(),
      expect.objectContaining({ workspaceId: workspace.id }),
    );
    expect(listWorkspaceSources).toHaveBeenCalledWith(
      actor,
      workspace.id,
      expect.objectContaining({ access: expect.objectContaining({ workspaceId: workspace.id }) }),
    );
    expect(webLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "workspace.bootstrap.stage.completed",
        stage: "parallel_reads",
        workspaceId: workspace.id,
      }),
      expect.any(String),
    );
    expect(webLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "workspace.bootstrap.completed",
        messageCount: 1,
        payloadBytes: expect.any(Number),
        readCount: 4,
        sourceCount: 0,
        workspaceId: workspace.id,
      }),
      expect.any(String),
    );
  });

  it("reuses the access snapshot for artifact history and detail reads", async () => {
    await loadWorkspaceBootstrap({
      actor,
      db: {} as Database,
      emptyConversationId: conversationId,
      requestedArtifactId: artifactId,
      requestedConversationId: conversationId,
      workspace,
    });

    expect(listArtifactHistory).toHaveBeenCalledWith(
      actor,
      { conversationId, workspaceId: workspace.id },
      expect.anything(),
      expect.objectContaining({ workspaceId: workspace.id }),
    );
    expect(getArtifactDetailForConversation).toHaveBeenCalledWith(
      actor,
      { artifactId, conversationId, workspaceId: workspace.id },
      expect.anything(),
      expect.objectContaining({ workspaceId: workspace.id }),
    );
    expect(canManageArtifactForConversation).toHaveBeenCalledWith(
      actor,
      { artifactId, conversationId, workspaceId: workspace.id },
      expect.anything(),
      expect.objectContaining({ workspaceId: workspace.id }),
    );
  });
});
