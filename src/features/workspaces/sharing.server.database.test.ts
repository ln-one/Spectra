import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { workspaces } from "@/database/schema";
import {
  ensurePrincipalForAuthUser,
  syncPrincipalEmailForAuthUser,
} from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { WorkspaceError } from "./errors";
import { sharedWorkspacePermissions } from "./policy";
import {
  createWorkspace,
  getWorkspaceById,
  listSharedWorkspaces,
  resolveWorkspace,
  updateWorkspace,
} from "./service";
import {
  getWorkspaceSharingState,
  grantWorkspaceAccess,
  revokeWorkspaceAccess,
  searchWorkspaceInviteCandidates,
  setWorkspaceReferenceability,
  setWorkspaceVisibility,
} from "./sharing.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let owner: Actor;
let visitor: Actor;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query("TRUNCATE TABLE public.workspaces, public.principals CASCADE");
  owner = await ensurePrincipalForAuthUser("share-owner", "owner", testDatabase.db);
  visitor = await ensurePrincipalForAuthUser("share-visitor", "visitor", testDatabase.db);
  await syncPrincipalEmailForAuthUser("share-visitor", "visitor@example.com", testDatabase.db);
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("explicit access is a fixed permission grant rather than a stored role", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Shared course", slug: "shared-course" },
    testDatabase.db,
  );

  const state = await grantWorkspaceAccess(
    owner,
    workspace.id,
    "VISITOR@EXAMPLE.COM",
    testDatabase.db,
  );

  expect(state.members).toEqual([
    expect.objectContaining({
      handle: "visitor",
      permissions: expect.arrayContaining([...sharedWorkspacePermissions]),
    }),
  ]);
  await expect(getWorkspaceById(visitor, workspace.id, testDatabase.db)).resolves.toMatchObject({
    permissions: [...sharedWorkspacePermissions],
  });
  await expect(listSharedWorkspaces(visitor, testDatabase.db)).resolves.toEqual([
    expect.objectContaining({ id: workspace.id }),
  ]);
});

test("invite search returns active ungranted users without exposing the owner", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Shared course", slug: "invite-search" },
    testDatabase.db,
  );
  const student = await ensurePrincipalForAuthUser("share-student", "student", testDatabase.db);
  await syncPrincipalEmailForAuthUser("share-student", "student@example.com", testDatabase.db);
  await grantWorkspaceAccess(owner, workspace.id, visitor.handle, testDatabase.db);

  await expect(
    searchWorkspaceInviteCandidates(owner, workspace.id, "stu", testDatabase.db),
  ).resolves.toEqual([
    {
      principalId: student.principalId,
      handle: "student",
      email: "student@example.com",
    },
  ]);
  await expect(
    searchWorkspaceInviteCandidates(owner, workspace.id, "owner", testDatabase.db),
  ).resolves.toEqual([]);
  await expect(
    searchWorkspaceInviteCandidates(owner, workspace.id, "visitor", testDatabase.db),
  ).resolves.toEqual([]);
});

test("public access is dynamic, is not listed as explicitly shared, and disappears when closed", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Public course", slug: "public-course" },
    testDatabase.db,
  );
  await setWorkspaceVisibility(owner, workspace.id, "public", testDatabase.db);

  await expect(getWorkspaceById(visitor, workspace.id, testDatabase.db)).resolves.toMatchObject({
    permissions: [...sharedWorkspacePermissions],
    visibility: "public",
  });
  await expect(listSharedWorkspaces(visitor, testDatabase.db)).resolves.toEqual([]);

  await setWorkspaceVisibility(owner, workspace.id, "private", testDatabase.db);
  await expect(getWorkspaceById(visitor, workspace.id, testDatabase.db)).rejects.toEqual(
    new WorkspaceError("workspace_not_found"),
  );
});

test("referenceability is independent from visibility and only sharing managers can change it", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Reusable course", slug: "reusable-course" },
    testDatabase.db,
  );
  await grantWorkspaceAccess(owner, workspace.id, visitor.handle, testDatabase.db);

  await expect(
    setWorkspaceReferenceability(owner, workspace.id, true, testDatabase.db),
  ).resolves.toMatchObject({
    referenceable: true,
    visibility: "private",
  });
  await expect(
    setWorkspaceReferenceability(visitor, workspace.id, false, testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_not_found"));
  await expect(
    setWorkspaceVisibility(owner, workspace.id, "public", testDatabase.db),
  ).resolves.toMatchObject({
    referenceable: true,
    visibility: "public",
  });
});

test("a legacy workspace without an address can disable referenceability", async () => {
  const workspace = await createWorkspace(owner, { name: "Legacy course" }, testDatabase.db);
  await testDatabase.db
    .update(workspaces)
    .set({ referenceable: true })
    .where(eq(workspaces.id, workspace.id));

  await expect(
    setWorkspaceReferenceability(owner, workspace.id, false, testDatabase.db),
  ).resolves.toMatchObject({
    referenceable: false,
    slug: null,
  });
  await expect(
    setWorkspaceReferenceability(owner, workspace.id, true, testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_slug_required"));
});

test("public readers can inspect sharing status without seeing explicit invitees", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Public course", slug: "public-member-privacy" },
    testDatabase.db,
  );
  await grantWorkspaceAccess(owner, workspace.id, visitor.handle, testDatabase.db);
  await setWorkspaceVisibility(owner, workspace.id, "public", testDatabase.db);
  const publicReader = await ensurePrincipalForAuthUser(
    "public-reader-auth",
    "public-reader",
    testDatabase.db,
  );

  await expect(
    getWorkspaceSharingState(publicReader, workspace.id, testDatabase.db),
  ).resolves.toMatchObject({
    canManage: false,
    members: [],
    visibility: "public",
  });
});

test("revoking access hides the workspace without deleting the grant history contract", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Private course", slug: "private-course" },
    testDatabase.db,
  );
  await grantWorkspaceAccess(owner, workspace.id, visitor.handle, testDatabase.db);
  await revokeWorkspaceAccess(owner, workspace.id, visitor.principalId, testDatabase.db);

  await expect(getWorkspaceById(visitor, workspace.id, testDatabase.db)).rejects.toEqual(
    new WorkspaceError("workspace_not_found"),
  );
  await expect(
    getWorkspaceSharingState(owner, workspace.id, testDatabase.db),
  ).resolves.toMatchObject({ members: [] });
});

test("first sharing makes the address permanent and preserves old locators as redirects", async () => {
  const workspace = await createWorkspace(
    owner,
    { name: "Course", slug: "course" },
    testDatabase.db,
  );
  await setWorkspaceVisibility(owner, workspace.id, "public", testDatabase.db);

  await expect(
    updateWorkspace(owner, workspace.id, { name: "Course", slug: null }, testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_slug_required"));
  await updateWorkspace(
    owner,
    workspace.id,
    { name: "Renamed course", slug: "renamed-course" },
    testDatabase.db,
  );

  await expect(
    resolveWorkspace(visitor, owner.handle, "course", testDatabase.db),
  ).resolves.toMatchObject({
    id: workspace.id,
    resolvedFromRedirect: true,
    slug: "renamed-course",
  });
});
