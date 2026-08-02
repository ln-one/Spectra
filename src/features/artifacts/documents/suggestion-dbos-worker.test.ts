import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/database/client";
import { ARTIFACT_SUGGESTIONS_WORKFLOW } from "./suggestion-dbos";
import { registerArtifactSuggestionDbosWorkflows } from "./suggestion-dbos-worker";
import {
  artifactSuggestionContextHash,
  readArtifactSuggestionSnapshot,
  writeArtifactSuggestionSnapshotIfCurrentRequest,
} from "./suggestion-snapshots.server";
import {
  type ArtifactSuggestionContext,
  generateArtifactSuggestions,
  loadArtifactSuggestionContext,
} from "./suggestions";

const dbosMocks = vi.hoisted(() => ({
  workflows: new Map<string, (...arguments_: never[]) => Promise<void>>(),
}));

vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: {
    registerStep: vi.fn((operation) => operation),
    registerWorkflow: vi.fn((workflow, options: { name: string }) => {
      dbosMocks.workflows.set(options.name, workflow);
      return workflow;
    }),
    stepStatus: { timeoutSignal: new AbortController().signal },
    workflowID: "suggestion-workflow-test",
  },
}));

vi.mock("@dbos-inc/drizzle-datasource", () => ({
  DrizzleDataSource: class {
    client = {};

    registerTransaction(operation: unknown) {
      return operation;
    }
  },
}));

vi.mock("./suggestion-snapshots.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("./suggestion-snapshots.server")>();
  return {
    ...original,
    readArtifactSuggestionSnapshot: vi.fn(),
    writeArtifactSuggestionSnapshotIfCurrentRequest: vi.fn(),
  };
});

vi.mock("./suggestions", async (importOriginal) => {
  const original = await importOriginal<typeof import("./suggestions")>();
  return {
    ...original,
    generateArtifactSuggestions: vi.fn(),
    loadArtifactSuggestionContext: vi.fn(),
  };
});

function context(workspaceUpdatedAt: string): ArtifactSuggestionContext {
  return {
    locale: "zh-CN",
    sourceFingerprint: [],
    sourceNames: [],
    target: "teaching_document",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workspaceName: "Workspace",
    workspaceUpdatedAt,
  };
}

function ownerLookupDatabase() {
  const limit = vi
    .fn()
    .mockResolvedValue([{ handle: "owner", principalId: "22222222-2222-4222-8222-222222222222" }]);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  return { select: vi.fn(() => ({ from })) } as unknown as Database;
}

beforeEach(() => {
  dbosMocks.workflows.clear();
  vi.mocked(loadArtifactSuggestionContext).mockReset();
  vi.mocked(generateArtifactSuggestions)
    .mockReset()
    .mockResolvedValue([
      { prompt: "Prompt 1", title: "Title 1" },
      { prompt: "Prompt 2", title: "Title 2" },
      { prompt: "Prompt 3", title: "Title 3" },
      { prompt: "Prompt 4", title: "Title 4" },
    ]);
  vi.mocked(readArtifactSuggestionSnapshot).mockReset().mockResolvedValue({ status: "missing" });
  vi.mocked(writeArtifactSuggestionSnapshotIfCurrentRequest).mockReset().mockResolvedValue(true);
});

describe("artifact suggestion DBOS worker", () => {
  it("returns a persistent daily schedule without automatic backfill", () => {
    expect(
      registerArtifactSuggestionDbosWorkflows({
        db: ownerLookupDatabase(),
        maintenanceQueueName: "maintenance",
        pool: {} as never,
      }),
    ).toEqual([
      expect.objectContaining({
        automaticBackfill: false,
        queueName: "maintenance",
        schedule: "0 3 * * *",
        scheduleName: "cleanupArtifactSuggestionsDaily",
      }),
    ]);
  });

  it("does not let an older generation overwrite a newer suggestion context", async () => {
    const requestedContext = context("2026-07-28T00:00:00.000Z");
    const newerContext = context("2026-07-28T00:01:00.000Z");
    vi.mocked(loadArtifactSuggestionContext)
      .mockResolvedValueOnce(requestedContext)
      .mockResolvedValueOnce(newerContext);

    registerArtifactSuggestionDbosWorkflows({
      db: ownerLookupDatabase(),
      maintenanceQueueName: "maintenance",
      pool: {} as never,
    });
    const workflow = dbosMocks.workflows.get(ARTIFACT_SUGGESTIONS_WORKFLOW);

    await expect(
      workflow?.(
        requestedContext.workspaceId as never,
        requestedContext.locale as never,
        requestedContext.target as never,
        artifactSuggestionContextHash(requestedContext) as never,
        1 as never,
      ),
    ).resolves.toBeUndefined();
    expect(generateArtifactSuggestions).toHaveBeenCalledOnce();
    expect(writeArtifactSuggestionSnapshotIfCurrentRequest).not.toHaveBeenCalled();
  });
});
