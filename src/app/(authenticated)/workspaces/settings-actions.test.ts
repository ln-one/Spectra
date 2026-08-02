import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentActor } from "@/features/identity/current";
import { WorkspaceError } from "@/features/workspaces/errors";
import { updateWorkspace } from "@/features/workspaces/service";
import { updateWorkspaceFromForm } from "./settings-actions";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/workspaces/service", () => ({ updateWorkspace: vi.fn() }));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const actor = { principalId: "principal-id", handle: "developer" };
const mockedGetCurrentActor = vi.mocked(getCurrentActor);
const mockedUpdateWorkspace = vi.mocked(updateWorkspace);

function settingsForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    workspaceId,
    conversationId,
    name: "Course notes",
    slug: "course-notes",
    ...overrides,
  })) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  mockedGetCurrentActor.mockReset().mockResolvedValue(actor);
  mockedUpdateWorkspace.mockReset().mockResolvedValue({
    id: workspaceId,
    ownerId: actor.principalId,
    ownerHandle: actor.handle,
    name: "Course notes",
    slug: "course-notes",
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  });
});

test("updates through the authenticated Actor and preserves the conversation address", async () => {
  await expect(updateWorkspaceFromForm(null, settingsForm())).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/developer/course-notes?conversation=${conversationId};307;`,
  });
  expect(mockedUpdateWorkspace).toHaveBeenCalledWith(actor, workspaceId, {
    name: "Course notes",
    slug: "course-notes",
  });
});

test("turns a blank slug into the internal workspace address", async () => {
  mockedUpdateWorkspace.mockResolvedValueOnce({
    id: workspaceId,
    ownerId: actor.principalId,
    ownerHandle: actor.handle,
    name: "Course notes",
    slug: null,
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  });

  await expect(
    updateWorkspaceFromForm(null, settingsForm({ conversationId: "", slug: "   " })),
  ).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/workspaces/${workspaceId};307;`,
  });
  expect(mockedUpdateWorkspace).toHaveBeenCalledWith(actor, workspaceId, {
    name: "Course notes",
    slug: null,
  });
});

test("rejects forged fields before resolving the Actor", async () => {
  const formData = settingsForm({ ownerId: "forged-owner" });

  await expect(updateWorkspaceFromForm(null, formData)).resolves.toEqual({
    code: "workspace_settings_invalid",
  });
  expect(mockedGetCurrentActor).not.toHaveBeenCalled();
  expect(mockedUpdateWorkspace).not.toHaveBeenCalled();
});

test("returns stable validation and slug-conflict codes", async () => {
  await expect(
    updateWorkspaceFromForm(null, settingsForm({ workspaceId: "invalid" })),
  ).resolves.toEqual({ code: "workspace_settings_invalid" });

  mockedUpdateWorkspace.mockRejectedValueOnce(new WorkspaceError("workspace_slug_conflict"));
  await expect(updateWorkspaceFromForm(null, settingsForm())).resolves.toEqual({
    code: "workspace_slug_conflict",
  });
});
