import { createMigratedTestDatabase } from "@tests/database";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { workspaces } from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import type { SourceCleanupQueue } from "@/features/sources/cleanup";
import { addWorkspaceReference, deleteSource } from "@/features/sources/service";
import { WorkspaceError } from "./errors";
import {
  collectReachableWorkspaceGraph,
  collectReachableWorkspaceIds,
  resolveReachableWorkspaceGraph,
  resolveReachableWorkspaceIds,
  type WorkspaceReferenceEdge,
} from "./reference-graph";
import { createWorkspace, setWorkspaceArchiveState } from "./service";
import {
  grantWorkspaceAccess,
  revokeWorkspaceAccess,
  setWorkspaceReferenceability,
  setWorkspaceVisibility,
} from "./sharing.server";

function edge(
  sourceId: string,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  createdAt = "2026-07-15T08:00:00.000Z",
): WorkspaceReferenceEdge {
  return { sourceId, sourceWorkspaceId, targetWorkspaceId, createdAt };
}

describe("collectReachableWorkspaceIds", () => {
  test("uses deterministic breadth-first order for multiple and diamond-shaped references", () => {
    expect(
      collectReachableWorkspaceIds("A", [
        edge("02", "A", "C"),
        edge("01", "A", "B"),
        edge("03", "B", "D"),
        edge("04", "C", "D"),
      ]),
    ).toEqual(["A", "B", "C", "D"]);
  });

  test("allows cycles without returning a Workspace twice", () => {
    expect(
      collectReachableWorkspaceIds("A", [
        edge("01", "A", "B"),
        edge("02", "B", "C"),
        edge("03", "C", "A"),
      ]),
    ).toEqual(["A", "B", "C"]);
  });

  test("retains every reachable edge while choosing the first deterministic BFS path", () => {
    const graph = collectReachableWorkspaceGraph(
      "A",
      ["A", "B", "C", "D"].map((id) => ({ id, name: id, archivedAt: null })),
      [
        edge("02", "A", "C"),
        edge("01", "A", "B"),
        edge("03", "B", "D"),
        edge("04", "C", "D"),
        edge("05", "D", "A"),
      ],
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(["A", "B", "C", "D"]);
    expect(graph.edges.map((item) => item.sourceId)).toEqual(["01", "02", "03", "04", "05"]);
    expect(graph.paths).toEqual([
      { workspaceId: "A", workspaceIds: ["A"], referenceSourceIds: [] },
      { workspaceId: "B", workspaceIds: ["A", "B"], referenceSourceIds: ["01"] },
      { workspaceId: "C", workspaceIds: ["A", "C"], referenceSourceIds: ["02"] },
      {
        workspaceId: "D",
        workspaceIds: ["A", "B", "D"],
        referenceSourceIds: ["01", "03"],
      },
    ]);
  });
});

describe("resolveReachableWorkspaceIds", () => {
  let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
  let alice: Actor;
  let bob: Actor;
  let charlie: Actor;

  beforeAll(async () => {
    testDatabase = await createMigratedTestDatabase();
  });

  beforeEach(async () => {
    await testDatabase.pool.query(
      "TRUNCATE TABLE public.workspace_reference_sources, public.sources, public.workspaces, public.principals CASCADE",
    );
    alice = await ensurePrincipalForAuthUser("graph-alice", "graph-alice", testDatabase.db);
    bob = await ensurePrincipalForAuthUser("graph-bob", "graph-bob", testDatabase.db);
    charlie = await ensurePrincipalForAuthUser("graph-charlie", "graph-charlie", testDatabase.db);
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  async function allowWorkspaceReferences(...workspaceIds: string[]) {
    await testDatabase.db
      .update(workspaces)
      .set({ referenceable: true })
      .where(inArray(workspaces.id, workspaceIds));
  }

  test("resolves an owned cyclic graph, pruning archived targets and soft-deleted edges", async () => {
    const workspaceA = await createWorkspace(alice, { name: "A" }, testDatabase.db);
    const workspaceB = await createWorkspace(alice, { name: "B" }, testDatabase.db);
    const workspaceC = await createWorkspace(alice, { name: "C" }, testDatabase.db);
    await allowWorkspaceReferences(workspaceA.id, workspaceB.id, workspaceC.id);
    await addWorkspaceReference(alice, workspaceA.id, workspaceB.id, { db: testDatabase.db });
    const edgeToC = await addWorkspaceReference(alice, workspaceB.id, workspaceC.id, {
      db: testDatabase.db,
    });
    await addWorkspaceReference(alice, workspaceC.id, workspaceA.id, { db: testDatabase.db });
    await setWorkspaceArchiveState(alice, workspaceC.id, "archived", testDatabase.db);

    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id]);
    await expect(
      resolveReachableWorkspaceGraph(alice, workspaceA.id, testDatabase.db),
    ).resolves.toMatchObject({
      rootWorkspaceId: workspaceA.id,
      nodes: [
        { id: workspaceA.id, archivedAt: null },
        { id: workspaceB.id, archivedAt: null },
      ],
    });

    const cleanupQueue: SourceCleanupQueue = {
      enqueue: async () => {
        throw new Error("Workspace references must not enqueue cleanup");
      },
    };
    await deleteSource(alice, edgeToC.id, {
      db: testDatabase.db,
      cleanupQueue,
      now: () => new Date("2026-07-15T09:00:00.000Z"),
    });
    await setWorkspaceArchiveState(alice, workspaceC.id, "active", testDatabase.db);

    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id]);
  });

  test("does not transfer access from a public root to its restricted references", async () => {
    const workspaceA = await createWorkspace(
      alice,
      { name: "Shared A", slug: "shared-a" },
      testDatabase.db,
    );
    const workspaceB = await createWorkspace(alice, { name: "Referenced B" }, testDatabase.db);
    await allowWorkspaceReferences(workspaceB.id);
    await addWorkspaceReference(alice, workspaceA.id, workspaceB.id, { db: testDatabase.db });
    await setWorkspaceVisibility(alice, workspaceA.id, "public", testDatabase.db);

    await expect(
      resolveReachableWorkspaceIds(bob, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id]);
  });

  test("reflects public access changes without deleting the reference", async () => {
    const workspaceA = await createWorkspace(alice, { name: "A" }, testDatabase.db);
    const workspaceB = await createWorkspace(bob, { name: "B", slug: "public-b" }, testDatabase.db);
    await allowWorkspaceReferences(workspaceB.id);
    await setWorkspaceVisibility(bob, workspaceB.id, "public", testDatabase.db);
    await addWorkspaceReference(alice, workspaceA.id, workspaceB.id, {
      db: testDatabase.db,
    });

    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id]);

    await setWorkspaceVisibility(bob, workspaceB.id, "private", testDatabase.db);
    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id]);

    await setWorkspaceVisibility(bob, workspaceB.id, "public", testDatabase.db);
    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id]);

    await setWorkspaceReferenceability(bob, workspaceB.id, false, testDatabase.db);
    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id]);
    await setWorkspaceReferenceability(bob, workspaceB.id, true, testDatabase.db);
    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id]);
  });

  test("traverses authorized cross-account paths and truncates at an inaccessible middle node", async () => {
    const workspaceA = await createWorkspace(alice, { name: "A", slug: "a" }, testDatabase.db);
    const workspaceB = await createWorkspace(bob, { name: "B", slug: "b" }, testDatabase.db);
    const workspaceC = await createWorkspace(charlie, { name: "C", slug: "c" }, testDatabase.db);
    await allowWorkspaceReferences(workspaceB.id, workspaceC.id);
    await grantWorkspaceAccess(bob, workspaceB.id, alice.handle, testDatabase.db);
    await grantWorkspaceAccess(charlie, workspaceC.id, bob.handle, testDatabase.db);
    await addWorkspaceReference(alice, workspaceA.id, workspaceB.id, {
      db: testDatabase.db,
    });
    await addWorkspaceReference(bob, workspaceB.id, workspaceC.id, {
      db: testDatabase.db,
    });

    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id]);

    await grantWorkspaceAccess(charlie, workspaceC.id, alice.handle, testDatabase.db);
    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id, workspaceB.id, workspaceC.id]);

    await revokeWorkspaceAccess(bob, workspaceB.id, alice.principalId, testDatabase.db);
    await expect(
      resolveReachableWorkspaceIds(alice, workspaceA.id, testDatabase.db),
    ).resolves.toEqual([workspaceA.id]);
  });

  test("rejects a root Workspace owned by another Actor", async () => {
    const foreign = await createWorkspace(bob, { name: "Foreign" }, testDatabase.db);

    await expect(resolveReachableWorkspaceIds(alice, foreign.id, testDatabase.db)).rejects.toEqual(
      new WorkspaceError("workspace_not_found"),
    );
  });
});
