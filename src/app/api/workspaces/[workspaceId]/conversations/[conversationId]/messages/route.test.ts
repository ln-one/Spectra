import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAiConversation } from "@/features/agents/conversation-records";
import {
  decodeAiMessageCursor,
  encodeAiMessageCursor,
  loadAiMessagePage,
} from "@/features/agents/message-records";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { WorkspaceError } from "@/features/workspaces/errors";
import { GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/agents/conversation-records", () => ({ findAiConversation: vi.fn() }));
vi.mock("@/features/agents/message-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/agents/message-records")>()),
  loadAiMessagePage: vi.fn(),
}));
vi.mock("@/features/workspaces/access.server", () => ({ requireWorkspacePermission: vi.fn() }));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000401" };
const workspaceId = "00000000-0000-4000-8000-000000000402";
const conversationId = "00000000-0000-4000-8000-000000000403";

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(requireWorkspacePermission)
    .mockReset()
    .mockResolvedValue({
      id: workspaceId,
      ownerId: actor.principalId,
      permissions: ["workspace.chat"],
      visibility: "private",
    });
  vi.mocked(findAiConversation)
    .mockReset()
    .mockResolvedValue({
      conversationId,
      createdByPrincipalId: actor.principalId,
      workspaceId,
    } as never);
  vi.mocked(loadAiMessagePage)
    .mockReset()
    .mockResolvedValue({
      items: [{ id: "message-1", parts: [{ text: "Hello", type: "text" }], role: "assistant" }],
      nextCursor: null,
    });
});

describe("Workspace message history read API", () => {
  it("returns an authorized message page and preserves the cursor boundary", async () => {
    const cursor = encodeAiMessageCursor(12);
    const response = await GET(
      new Request(
        `http://localhost/api/workspaces/${workspaceId}/conversations/${conversationId}/messages?before=${encodeURIComponent(cursor)}`,
      ),
      { params: Promise.resolve({ workspaceId, conversationId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      items: [{ id: "message-1", parts: [{ text: "Hello", type: "text" }], role: "assistant" }],
      nextCursor: null,
    });
    expect(decodeAiMessageCursor(cursor)).toBe(12);
    expect(loadAiMessagePage).toHaveBeenCalledWith({
      beforePosition: 12,
      conversationId,
      workspaceId,
    });
  });

  it("returns 404 for a conversation outside the actor scope", async () => {
    vi.mocked(findAiConversation).mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId, conversationId }),
    });

    expect(response.status).toBe(404);
    expect(loadAiMessagePage).not.toHaveBeenCalled();
  });

  it("rejects invalid cursors before authentication", async () => {
    const response = await GET(new Request("http://localhost/api/messages?before=bad"), {
      params: Promise.resolve({ workspaceId, conversationId }),
    });

    expect(response.status).toBe(400);
    expect(getCurrentActor).not.toHaveBeenCalled();
  });

  it("rejects an empty cursor before authentication", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/workspaces/${workspaceId}/conversations/${conversationId}/messages?before=`,
      ),
      { params: Promise.resolve({ workspaceId, conversationId }) },
    );

    expect(response.status).toBe(400);
    expect(getCurrentActor).not.toHaveBeenCalled();
  });

  it("maps authentication and workspace failures explicitly", async () => {
    vi.mocked(getCurrentActor).mockRejectedValueOnce(new IdentityError("authentication_required"));
    const unauthenticated = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId, conversationId }),
    });
    expect(unauthenticated.status).toBe(401);

    vi.mocked(requireWorkspacePermission).mockRejectedValueOnce(
      new WorkspaceError("workspace_not_found"),
    );
    const unavailable = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId, conversationId }),
    });
    expect(unavailable.status).toBe(404);
  });
});
