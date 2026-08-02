import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAiConversationCursor } from "@/features/agents/conversation-records";
import { listWorkspaceConversationPage } from "@/features/agents/server";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { WorkspaceError } from "@/features/workspaces/errors";
import { GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/agents/server", () => ({ listWorkspaceConversationPage: vi.fn() }));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000401" };
const workspaceId = "00000000-0000-4000-8000-000000000402";
const conversationId = "00000000-0000-4000-8000-000000000403";

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(listWorkspaceConversationPage)
    .mockReset()
    .mockResolvedValue({
      items: [
        {
          conversationId,
          title: "First",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
});

describe("Workspace conversation read API", () => {
  it("returns a bounded page with private no-store semantics", async () => {
    const response = await GET(
      new Request(`http://localhost/api/workspaces/${workspaceId}/conversations`),
      {
        params: Promise.resolve({ workspaceId }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      items: [
        {
          conversationId,
          title: "First",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    expect(listWorkspaceConversationPage).toHaveBeenCalledWith(
      expect.objectContaining({ actor, workspaceId }),
    );
  });

  it("passes an opaque cursor without accepting a client page size", async () => {
    const cursor = encodeAiConversationCursor({
      id: conversationId,
      updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    const response = await GET(
      new Request(
        `http://localhost/api/workspaces/${workspaceId}/conversations?after=${encodeURIComponent(cursor)}&limit=500`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    );

    expect(response.status).toBe(200);
    expect(listWorkspaceConversationPage).toHaveBeenCalledWith(
      expect.objectContaining({ actor, workspaceId, cursor: expect.any(Object) }),
    );
    expect(listWorkspaceConversationPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ limit: expect.anything() }),
    );
  });

  it("rejects malformed cursors before authentication", async () => {
    const response = await GET(
      new Request(`http://localhost/api/workspaces/${workspaceId}/conversations?after=bad`),
      { params: Promise.resolve({ workspaceId }) },
    );

    expect(response.status).toBe(400);
    expect(getCurrentActor).not.toHaveBeenCalled();
  });

  it("rejects an empty cursor before authentication", async () => {
    const response = await GET(
      new Request(`http://localhost/api/workspaces/${workspaceId}/conversations?after=`),
      { params: Promise.resolve({ workspaceId }) },
    );

    expect(response.status).toBe(400);
    expect(getCurrentActor).not.toHaveBeenCalled();
  });

  it("maps authentication and authorization failures without revealing workspace existence", async () => {
    vi.mocked(getCurrentActor).mockRejectedValueOnce(new IdentityError("authentication_required"));
    const unauthenticated = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(unauthenticated.status).toBe(401);

    vi.mocked(listWorkspaceConversationPage).mockRejectedValueOnce(
      new WorkspaceError("workspace_not_found"),
    );
    const unavailable = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ workspaceId }),
    });
    expect(unavailable.status).toBe(404);
  });
});
