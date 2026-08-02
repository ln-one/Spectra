import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentResumableStreamContext } from "@/features/agents/resumable-stream";
import { abortAiRun } from "@/features/agents/run-cancellation";
import { requestAiRunCancellationByClientRequest } from "@/features/agents/runs";
import { getCurrentActor } from "@/features/identity/current";
import { getWorkspaceById } from "@/features/workspaces/service";
import { DELETE } from "./route";

vi.mock("@/features/agents/resumable-stream", () => ({
  agentResumableStreamContext: vi.fn(),
}));
vi.mock("@/features/agents/run-cancellation", () => ({ abortAiRun: vi.fn() }));
vi.mock("@/features/agents/runs", () => ({
  requestAiRunCancellationByClientRequest: vi.fn(),
}));
vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/workspaces/service", () => ({ getWorkspaceById: vi.fn() }));

const actor = { handle: "alice", principalId: "36fa8dc6-5db4-41e3-a709-2cd37a9c8520" };
const conversationId = "9924e340-a561-40d8-94de-86cfcda40ecb";
const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";
const clientRequestId = "request-browser-stop";
const runId = "10000000-0000-4000-8000-000000000001";
const deleteStream = vi.fn();

function request() {
  const query = new URLSearchParams({ clientRequestId, conversationId, workspaceId });
  return new Request(`http://localhost/api/agent/runs/by-request?${query.toString()}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getWorkspaceById)
    .mockReset()
    .mockResolvedValue({ id: workspaceId } as never);
  vi.mocked(requestAiRunCancellationByClientRequest)
    .mockReset()
    .mockResolvedValue({ id: runId, state: "cancelled" } as never);
  vi.mocked(abortAiRun).mockReset().mockReturnValue(true);
  deleteStream.mockReset().mockResolvedValue(undefined);
  vi.mocked(agentResumableStreamContext)
    .mockReset()
    .mockResolvedValue({ delete: deleteStream } as never);
});

describe("DELETE /api/agent/runs/by-request", () => {
  it("cancels the scoped run, aborts local execution, and removes its resumable stream", async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(204);
    expect(requestAiRunCancellationByClientRequest).toHaveBeenCalledWith({
      clientRequestId,
      conversationId,
      createdByPrincipalId: actor.principalId,
      workspaceId,
    });
    expect(abortAiRun).toHaveBeenCalledWith(runId);
    expect(deleteStream).toHaveBeenCalledWith(runId);
  });

  it("does not abort or delete a run that is not visible to the caller", async () => {
    vi.mocked(requestAiRunCancellationByClientRequest).mockResolvedValue(null);

    const response = await DELETE(request());

    expect(response.status).toBe(404);
    expect(abortAiRun).not.toHaveBeenCalled();
    expect(deleteStream).not.toHaveBeenCalled();
  });
});
