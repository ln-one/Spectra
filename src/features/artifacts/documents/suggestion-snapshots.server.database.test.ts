import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import {
  markArtifactSuggestionSnapshotRefreshing,
  readArtifactSuggestionSnapshot,
  reserveArtifactSuggestionRequest,
  writeArtifactSuggestionSnapshot,
  writeArtifactSuggestionSnapshotIfCurrentRequest,
} from "./suggestion-snapshots.server";
import type { ArtifactSuggestionContext } from "./suggestions";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.artifact_suggestion_requests, public.artifact_suggestion_snapshots, public.workspaces, public.principals CASCADE",
  );
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("distinguishes fresh, stale, changed, and expired suggestion snapshots", async () => {
  const actor = await ensurePrincipalForAuthUser(
    "suggestion-user",
    "suggestion-user",
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Physics" }, testDatabase.db);
  const generatedAt = new Date("2026-07-18T00:00:00.000Z");
  const context: ArtifactSuggestionContext = {
    locale: "en-US",
    sourceFingerprint: [],
    sourceNames: ["mechanics.pdf"],
    target: "teaching_document",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceUpdatedAt: workspace.updatedAt,
  };
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Create lesson ${index + 1}`,
    title: `Lesson ${index + 1}`,
  }));

  await writeArtifactSuggestionSnapshot(context, suggestions, generatedAt, testDatabase.db);

  await expect(
    readArtifactSuggestionSnapshot(context, new Date("2026-07-18T00:29:59.999Z"), testDatabase.db),
  ).resolves.toEqual({ generatedAt, status: "fresh", suggestions });
  await expect(
    readArtifactSuggestionSnapshot(context, new Date("2026-07-18T00:30:00.000Z"), testDatabase.db),
  ).resolves.toEqual({ generatedAt, status: "stale", suggestions });
  await expect(
    readArtifactSuggestionSnapshot(
      { ...context, sourceNames: ["changed.pdf"] },
      new Date("2026-07-18T00:30:00.000Z"),
      testDatabase.db,
    ),
  ).resolves.toEqual({ status: "changed" });
  await expect(
    readArtifactSuggestionSnapshot(context, new Date("2026-07-25T00:00:00.000Z"), testDatabase.db),
  ).resolves.toEqual({ status: "missing" });
});

test("keeps Word, Mind Map, and Quiz snapshots independent", async () => {
  const actor = await ensurePrincipalForAuthUser(
    "suggestion-target-user",
    "suggestion-target-user",
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Physics" }, testDatabase.db);
  const base: Omit<ArtifactSuggestionContext, "target"> = {
    locale: "zh-CN",
    sourceFingerprint: [],
    sourceNames: [],
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceUpdatedAt: workspace.updatedAt,
  };
  const documentSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Document ${index}`,
    title: `Document ${index}`,
  }));
  const mindMapSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Mind map ${index}`,
    title: `Mind map ${index}`,
  }));
  const quizSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Quiz ${index}`,
    title: `Quiz ${index}`,
  }));
  const generatedAt = new Date("2026-07-20T00:00:00.000Z");
  await writeArtifactSuggestionSnapshot(
    { ...base, target: "teaching_document" },
    documentSuggestions,
    generatedAt,
    testDatabase.db,
  );
  await writeArtifactSuggestionSnapshot(
    { ...base, target: "mind_map" },
    mindMapSuggestions,
    generatedAt,
    testDatabase.db,
  );
  await writeArtifactSuggestionSnapshot(
    { ...base, target: "quiz" },
    quizSuggestions,
    generatedAt,
    testDatabase.db,
  );
  await expect(
    readArtifactSuggestionSnapshot(
      { ...base, target: "teaching_document" },
      new Date("2026-07-20T00:01:00.000Z"),
      testDatabase.db,
    ),
  ).resolves.toEqual({ generatedAt, status: "fresh", suggestions: documentSuggestions });
  await expect(
    readArtifactSuggestionSnapshot(
      { ...base, target: "mind_map" },
      new Date("2026-07-20T00:01:00.000Z"),
      testDatabase.db,
    ),
  ).resolves.toEqual({ generatedAt, status: "fresh", suggestions: mindMapSuggestions });
  await expect(
    readArtifactSuggestionSnapshot(
      { ...base, target: "quiz" },
      new Date("2026-07-20T00:01:00.000Z"),
      testDatabase.db,
    ),
  ).resolves.toEqual({ generatedAt, status: "fresh", suggestions: quizSuggestions });
});

test("keeps a requested refresh visible until a newer snapshot is written", async () => {
  const actor = await ensurePrincipalForAuthUser(
    "suggestion-refresh-user",
    "suggestion-refresh-user",
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Statistics" }, testDatabase.db);
  const generatedAt = new Date("2026-07-20T00:00:00.000Z");
  const context: ArtifactSuggestionContext = {
    locale: "zh-CN",
    sourceFingerprint: [],
    sourceNames: [],
    target: "presentation",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceUpdatedAt: workspace.updatedAt,
  };
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Presentation ${index}`,
    title: `Presentation ${index}`,
  }));
  await writeArtifactSuggestionSnapshot(context, suggestions, generatedAt, testDatabase.db);

  const refreshRequestedAt = new Date("2026-07-20T00:01:00.000Z");
  await expect(
    markArtifactSuggestionSnapshotRefreshing(
      context,
      generatedAt,
      refreshRequestedAt,
      testDatabase.db,
    ),
  ).resolves.toBe(true);
  await expect(
    readArtifactSuggestionSnapshot(context, refreshRequestedAt, testDatabase.db),
  ).resolves.toEqual({ generatedAt, status: "stale", suggestions });

  const refreshedAt = new Date("2026-07-20T00:02:00.000Z");
  await writeArtifactSuggestionSnapshot(context, suggestions, refreshedAt, testDatabase.db);
  await expect(
    readArtifactSuggestionSnapshot(context, refreshedAt, testDatabase.db),
  ).resolves.toEqual({ generatedAt: refreshedAt, status: "fresh", suggestions });
});

test("does not let an older request overwrite a newer suggestion snapshot", async () => {
  const actor = await ensurePrincipalForAuthUser(
    "suggestion-order-user",
    "suggestion-order-user",
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Concurrency" }, testDatabase.db);
  const baseContext: ArtifactSuggestionContext = {
    locale: "en-US",
    sourceFingerprint: [],
    sourceNames: [],
    target: "quiz",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceUpdatedAt: workspace.updatedAt,
  };
  const olderContext = { ...baseContext, sourceNames: ["older.pdf"] };
  const newerContext = { ...baseContext, sourceNames: ["newer.pdf"] };
  const olderSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Older ${index}`,
    title: `Older ${index}`,
  }));
  const newerSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Newer ${index}`,
    title: `Newer ${index}`,
  }));
  const olderRequest = await reserveArtifactSuggestionRequest(olderContext, testDatabase.db);
  const newerRequest = await reserveArtifactSuggestionRequest(newerContext, testDatabase.db);
  expect(newerRequest.epoch).toBe(olderRequest.epoch + 1);

  await expect(
    writeArtifactSuggestionSnapshotIfCurrentRequest(
      newerContext,
      newerSuggestions,
      newerRequest.epoch,
      new Date("2026-07-28T00:00:02.000Z"),
      testDatabase.db,
    ),
  ).resolves.toBe(true);
  await expect(
    writeArtifactSuggestionSnapshotIfCurrentRequest(
      olderContext,
      olderSuggestions,
      olderRequest.epoch,
      new Date("2026-07-28T00:00:03.000Z"),
      testDatabase.db,
    ),
  ).resolves.toBe(false);
  await expect(
    readArtifactSuggestionSnapshot(
      newerContext,
      new Date("2026-07-28T00:00:04.000Z"),
      testDatabase.db,
    ),
  ).resolves.toEqual({
    generatedAt: new Date("2026-07-28T00:00:02.000Z"),
    status: "fresh",
    suggestions: newerSuggestions,
  });
});
