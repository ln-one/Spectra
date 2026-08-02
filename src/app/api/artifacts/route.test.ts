import { beforeEach, expect, test, vi } from "vitest";
import { listArtifactHistory } from "@/features/artifacts/workbench-server";
import { getCurrentActor } from "@/features/identity/current";
import { GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/workbench-server", () => ({ listArtifactHistory: vi.fn() }));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000401" };
const workspaceId = "00000000-0000-4000-8000-000000000402";
const conversationId = "00000000-0000-4000-8000-000000000403";

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(listArtifactHistory).mockReset().mockResolvedValue([]);
});

test("lists mixed Artifact history through the authorized conversation scope", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/artifacts?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ artifacts: [] });
  expect(listArtifactHistory).toHaveBeenCalledWith(actor, { conversationId, workspaceId });
});

test("rejects an invalid generic History scope before authentication", async () => {
  const response = await GET(
    new Request(`http://localhost/api/artifacts?workspaceId=${workspaceId}&extra=true`),
  );
  expect(response.status).toBe(400);
  expect(getCurrentActor).not.toHaveBeenCalled();
});
