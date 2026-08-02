import { beforeEach, expect, test, vi } from "vitest";
import { deleteWorkspaceThread } from "@/features/agents/thread-deletion";
import { renameWorkspaceThread } from "@/features/agents/threads";
import { getCurrentActor } from "@/features/identity/current";
import { getWorkspaceById } from "@/features/workspaces/service";
import { deleteWorkspaceThreadFromForm, renameWorkspaceThreadFromForm } from "./thread-actions";

vi.mock("@/features/agents/thread-deletion", () => ({ deleteWorkspaceThread: vi.fn() }));
vi.mock("@/features/agents/threads", () => ({ renameWorkspaceThread: vi.fn() }));
vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/workspaces/service", () => ({ getWorkspaceById: vi.fn() }));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
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
  updatedAt: "2026-07-16T00:00:00.000Z",
};
const mockedGetCurrentActor = vi.mocked(getCurrentActor);
const mockedGetWorkspaceById = vi.mocked(getWorkspaceById);
const mockedDeleteWorkspaceThread = vi.mocked(deleteWorkspaceThread);
const mockedRenameWorkspaceThread = vi.mocked(renameWorkspaceThread);

function renameForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    workspaceId,
    conversationId,
    title: "TCP/IP 课堂讲解",
    ...overrides,
  })) {
    formData.set(key, value);
  }
  return formData;
}

function deleteForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries({ workspaceId, conversationId, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  mockedGetCurrentActor.mockReset().mockResolvedValue(actor);
  mockedGetWorkspaceById.mockReset().mockResolvedValue(workspace);
  mockedDeleteWorkspaceThread.mockReset().mockResolvedValue({ conversationId });
  mockedRenameWorkspaceThread.mockReset().mockResolvedValue({
    conversationId,
    title: "TCP/IP 课堂讲解",
  });
});

test("deletes through the authenticated workspace and leaves the deleted thread URL", async () => {
  await expect(deleteWorkspaceThreadFromForm(null, deleteForm())).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/developer/course-notes;307;",
  });
  expect(mockedGetWorkspaceById).toHaveBeenCalledWith(actor, workspaceId);
  expect(mockedDeleteWorkspaceThread).toHaveBeenCalledWith(workspace, conversationId, {
    createdByPrincipalId: actor.principalId,
  });
});

test("rejects forged delete fields before resolving identity", async () => {
  await expect(
    deleteWorkspaceThreadFromForm(null, deleteForm({ ownerId: "forged" })),
  ).resolves.toEqual({ code: "thread_delete_failed" });
  expect(mockedGetCurrentActor).not.toHaveBeenCalled();
  expect(mockedDeleteWorkspaceThread).not.toHaveBeenCalled();
});

test("returns a stable missing-thread code when deletion loses a race", async () => {
  mockedDeleteWorkspaceThread.mockResolvedValueOnce(null);
  await expect(deleteWorkspaceThreadFromForm(null, deleteForm())).resolves.toEqual({
    code: "thread_not_found",
  });
});

test("renames through the authenticated workspace and preserves the selected thread", async () => {
  await expect(renameWorkspaceThreadFromForm(null, renameForm())).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/developer/course-notes?conversation=${conversationId};307;`,
  });
  expect(mockedGetWorkspaceById).toHaveBeenCalledWith(actor, workspaceId);
  expect(mockedRenameWorkspaceThread).toHaveBeenCalledWith(
    workspace,
    conversationId,
    "TCP/IP 课堂讲解",
    actor.principalId,
  );
});

test("rejects forged fields before resolving identity", async () => {
  await expect(
    renameWorkspaceThreadFromForm(null, renameForm({ ownerId: "forged" })),
  ).resolves.toEqual({ code: "thread_title_invalid" });
  expect(mockedGetCurrentActor).not.toHaveBeenCalled();
  expect(mockedRenameWorkspaceThread).not.toHaveBeenCalled();
});

test("returns stable invalid and missing-thread codes", async () => {
  await expect(
    renameWorkspaceThreadFromForm(null, renameForm({ conversationId: "invalid" })),
  ).resolves.toEqual({ code: "thread_title_invalid" });

  mockedRenameWorkspaceThread.mockResolvedValueOnce(null);
  await expect(renameWorkspaceThreadFromForm(null, renameForm())).resolves.toEqual({
    code: "thread_not_found",
  });
});
