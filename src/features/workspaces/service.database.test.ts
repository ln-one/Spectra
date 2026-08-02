import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { WorkspaceError } from "./errors";
import { canReadWorkspace } from "./policy";
import {
  createWorkspace,
  getWorkspaceById,
  listWorkspaces,
  renameWorkspace,
  resolveWorkspace,
  setWorkspaceArchiveState,
  updateWorkspace,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let alice: Actor;
let bob: Actor;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query("TRUNCATE TABLE public.workspaces, public.principals CASCADE");
  alice = await ensurePrincipalForAuthUser("auth-alice", "alice", testDatabase.db);
  bob = await ensurePrincipalForAuthUser("auth-bob", "bob", testDatabase.db);
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("derives owner from Actor and rejects forged input", async () => {
  const created = await createWorkspace(alice, { name: " Notes ", slug: null }, testDatabase.db);
  expect(created).toMatchObject({ ownerId: alice.principalId, name: "Notes", slug: null });
  await expect(
    createWorkspace(alice, { name: "Forged", ownerId: bob.principalId } as never, testDatabase.db),
  ).rejects.toThrow();
});

test("allows null slugs and reuses a slug across different owners", async () => {
  await createWorkspace(alice, { name: "One" }, testDatabase.db);
  await createWorkspace(alice, { name: "Two" }, testDatabase.db);
  await createWorkspace(alice, { name: "Alice", slug: "shared" }, testDatabase.db);
  await createWorkspace(bob, { name: "Bob", slug: "shared" }, testDatabase.db);
  expect(await listWorkspaces(alice, testDatabase.db)).toHaveLength(3);
  expect(await listWorkspaces(bob, testDatabase.db)).toHaveLength(1);
});

test("rejects a duplicate owner slug", async () => {
  await createWorkspace(alice, { name: "One", slug: "same" }, testDatabase.db);
  await expect(
    createWorkspace(alice, { name: "Two", slug: "same" }, testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_slug_conflict"));
});

test("updates an owned workspace and normalizes its public address", async () => {
  const created = await createWorkspace(alice, { name: "Draft" }, testDatabase.db);
  const updated = await updateWorkspace(
    alice,
    created.id,
    { name: " Final notes ", slug: " Course-Notes " },
    testDatabase.db,
  );

  expect(updated).toMatchObject({
    id: created.id,
    ownerId: alice.principalId,
    ownerHandle: "alice",
    name: "Final notes",
    slug: "course-notes",
  });
  expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
    new Date(created.updatedAt).getTime(),
  );
});

test("clears a workspace slug without changing its owner", async () => {
  const created = await createWorkspace(alice, { name: "Notes", slug: "notes" }, testDatabase.db);

  await expect(
    updateWorkspace(alice, created.id, { name: "Notes", slug: null }, testDatabase.db),
  ).resolves.toMatchObject({ ownerId: alice.principalId, slug: null });
});

test("does not let another Actor update a workspace", async () => {
  const created = await createWorkspace(alice, { name: "Private" }, testDatabase.db);

  await expect(
    updateWorkspace(bob, created.id, { name: "Taken", slug: null }, testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_not_found"));
  await expect(getWorkspaceById(alice, created.id, testDatabase.db)).resolves.toMatchObject({
    name: "Private",
  });
});

test("renames an owned workspace without changing its slug or archive state", async () => {
  const created = await createWorkspace(
    alice,
    { name: "Draft", slug: "course-notes" },
    testDatabase.db,
  );
  const archived = await setWorkspaceArchiveState(alice, created.id, "archived", testDatabase.db);

  await expect(
    renameWorkspace(alice, created.id, " Final notes ", testDatabase.db),
  ).resolves.toMatchObject({
    id: created.id,
    name: "Final notes",
    slug: "course-notes",
    archivedAt: archived.archivedAt,
  });
});

test("archives and restores an owned workspace without blocking direct access", async () => {
  const created = await createWorkspace(
    alice,
    { name: "Reference", slug: "reference" },
    testDatabase.db,
  );

  const archived = await setWorkspaceArchiveState(alice, created.id, "archived", testDatabase.db);
  expect(archived.archivedAt).not.toBeNull();
  await expect(getWorkspaceById(alice, created.id, testDatabase.db)).resolves.toMatchObject({
    archivedAt: archived.archivedAt,
  });
  await expect(
    resolveWorkspace(alice, "alice", "reference", testDatabase.db),
  ).resolves.toMatchObject({ id: created.id, archivedAt: archived.archivedAt });

  await expect(
    setWorkspaceArchiveState(alice, created.id, "active", testDatabase.db),
  ).resolves.toMatchObject({ id: created.id, archivedAt: null });
});

test("does not let another Actor rename or archive a workspace", async () => {
  const created = await createWorkspace(alice, { name: "Private" }, testDatabase.db);

  await expect(renameWorkspace(bob, created.id, "Taken", testDatabase.db)).rejects.toEqual(
    new WorkspaceError("workspace_not_found"),
  );
  await expect(
    setWorkspaceArchiveState(bob, created.id, "archived", testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_not_found"));
  await expect(getWorkspaceById(alice, created.id, testDatabase.db)).resolves.toMatchObject({
    name: "Private",
    archivedAt: null,
  });
});

test("lists active and archived workspaces by updated time then id", async () => {
  const older = await createWorkspace(alice, { name: "Older" }, testDatabase.db);
  const newer = await createWorkspace(alice, { name: "Newer" }, testDatabase.db);
  await setWorkspaceArchiveState(alice, newer.id, "archived", testDatabase.db);
  await testDatabase.pool.query("UPDATE workspaces SET updated_at = $1 WHERE id = $2", [
    "2026-07-01T00:00:00.000Z",
    older.id,
  ]);
  await testDatabase.pool.query("UPDATE workspaces SET updated_at = $1 WHERE id = $2", [
    "2026-07-02T00:00:00.000Z",
    newer.id,
  ]);

  const listed = await listWorkspaces(alice, testDatabase.db);
  expect(listed.map(({ id }) => id)).toEqual([newer.id, older.id]);
  expect(listed[0]?.archivedAt).not.toBeNull();
});

test("rejects forged settings fields and conflicting owner slugs", async () => {
  const first = await createWorkspace(alice, { name: "One", slug: "one" }, testDatabase.db);
  const second = await createWorkspace(alice, { name: "Two", slug: "two" }, testDatabase.db);

  await expect(
    updateWorkspace(
      alice,
      first.id,
      { name: "Forged", slug: null, ownerId: bob.principalId } as never,
      testDatabase.db,
    ),
  ).rejects.toThrow();
  await expect(
    updateWorkspace(alice, second.id, { name: "Two", slug: "one" }, testDatabase.db),
  ).rejects.toEqual(new WorkspaceError("workspace_slug_conflict"));
});

test("lets exactly one concurrent update claim an owner slug", async () => {
  const first = await createWorkspace(alice, { name: "One" }, testDatabase.db);
  const second = await createWorkspace(alice, { name: "Two" }, testDatabase.db);

  const results = await Promise.allSettled([
    updateWorkspace(alice, first.id, { name: "One", slug: "shared" }, testDatabase.db),
    updateWorkspace(alice, second.id, { name: "Two", slug: "shared" }, testDatabase.db),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({
    status: "rejected",
    reason: new WorkspaceError("workspace_slug_conflict"),
  });
});

test("uses the same not-found result for missing and private foreign workspaces", async () => {
  const created = await createWorkspace(
    alice,
    { name: "Private", slug: "private" },
    testDatabase.db,
  );
  await expect(getWorkspaceById(bob, created.id, testDatabase.db)).rejects.toEqual(
    new WorkspaceError("workspace_not_found"),
  );
  await expect(resolveWorkspace(bob, "alice", "private", testDatabase.db)).rejects.toEqual(
    new WorkspaceError("workspace_not_found"),
  );
  await expect(getWorkspaceById(alice, crypto.randomUUID(), testDatabase.db)).rejects.toEqual(
    new WorkspaceError("workspace_not_found"),
  );
});

test("keeps v1 policy owner-only even for public visibility", () => {
  expect(canReadWorkspace(alice, alice.principalId)).toBe(true);
  expect(canReadWorkspace(bob, alice.principalId)).toBe(false);
});
