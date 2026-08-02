import { revalidatePath } from "next/cache";
import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentActor } from "@/features/identity/current";
import { WorkspaceError } from "@/features/workspaces/errors";
import { renameWorkspace, setWorkspaceArchiveState } from "@/features/workspaces/service";
import {
  renameWorkspaceFromDashboard,
  setWorkspaceArchiveStateFromDashboard,
} from "./dashboard-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/workspaces/service", () => ({
  renameWorkspace: vi.fn(),
  setWorkspaceArchiveState: vi.fn(),
}));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const actor = { principalId: "principal-id", handle: "developer" };
const workspace = {
  id: workspaceId,
  ownerId: actor.principalId,
  ownerHandle: actor.handle,
  name: "Course notes",
  slug: "course-notes",
  visibility: "private" as const,
  archivedAt: null,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};
const mockedGetCurrentActor = vi.mocked(getCurrentActor);
const mockedRenameWorkspace = vi.mocked(renameWorkspace);
const mockedSetWorkspaceArchiveState = vi.mocked(setWorkspaceArchiveState);
const mockedRevalidatePath = vi.mocked(revalidatePath);

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  mockedGetCurrentActor.mockReset().mockResolvedValue(actor);
  mockedRenameWorkspace.mockReset().mockResolvedValue(workspace);
  mockedSetWorkspaceArchiveState.mockReset().mockResolvedValue(workspace);
  mockedRevalidatePath.mockReset();
});

test("renames through the authenticated Actor and revalidates the dashboard", async () => {
  await expect(
    renameWorkspaceFromDashboard(null, form({ workspaceId, name: "Course notes" })),
  ).resolves.toEqual({ status: "success", workspaceName: "Course notes" });

  expect(mockedRenameWorkspace).toHaveBeenCalledWith(actor, workspaceId, "Course notes");
  expect(mockedRevalidatePath).toHaveBeenCalledWith("/workspaces");
});

test("archives and restores through the same narrow action", async () => {
  await expect(
    setWorkspaceArchiveStateFromDashboard(null, form({ workspaceId, operation: "archive" })),
  ).resolves.toEqual({
    status: "success",
    operation: "archive",
    workspaceName: "Course notes",
  });
  expect(mockedSetWorkspaceArchiveState).toHaveBeenCalledWith(actor, workspaceId, "archived");

  await setWorkspaceArchiveStateFromDashboard(null, form({ workspaceId, operation: "restore" }));
  expect(mockedSetWorkspaceArchiveState).toHaveBeenLastCalledWith(actor, workspaceId, "active");
});

test("rejects forged fields before resolving the Actor", async () => {
  await expect(
    renameWorkspaceFromDashboard(
      null,
      form({ workspaceId, name: "Forged", ownerId: "another-owner" }),
    ),
  ).resolves.toEqual({ status: "error", code: "workspace_name_invalid" });
  expect(mockedGetCurrentActor).not.toHaveBeenCalled();
  expect(mockedRenameWorkspace).not.toHaveBeenCalled();
});

test("returns stable validation and owner-scoped not-found errors", async () => {
  await expect(
    setWorkspaceArchiveStateFromDashboard(
      null,
      form({ workspaceId: "invalid", operation: "archive" }),
    ),
  ).resolves.toEqual({ status: "error", code: "workspace_archive_failed" });

  mockedRenameWorkspace.mockRejectedValueOnce(new WorkspaceError("workspace_not_found"));
  await expect(
    renameWorkspaceFromDashboard(null, form({ workspaceId, name: "Missing" })),
  ).resolves.toEqual({ status: "error", code: "workspace_not_found" });
});
