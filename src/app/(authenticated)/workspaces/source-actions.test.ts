import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentActor } from "@/features/identity/current";
import { SourceError } from "@/features/sources/errors";
import { startSourceIngestion } from "@/features/sources/ingestion/service";
import {
  addWorkspaceReference,
  listWorkspaceReferenceCandidates,
  listWorkspaceSources,
  resolveWorkspaceReferenceLocator,
  startSourceUpload,
} from "@/features/sources/service";
import { deleteWorkspaceSource } from "@/features/workspaces/source-deletion.server";
import {
  addWorkspaceReferenceAction,
  deleteSourceAction,
  listSourcesAction,
  listWorkspaceReferenceCandidatesAction,
  resolveWorkspaceReferenceLocatorAction,
  startSourceIngestionAction,
  startSourceUploadAction,
} from "./source-actions";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/sources/service", () => ({
  addWorkspaceReference: vi.fn(),
  completeSourceUpload: vi.fn(),
  listWorkspaceReferenceCandidates: vi.fn(),
  listWorkspaceSources: vi.fn(),
  prepareSourceUpload: vi.fn(),
  resolveWorkspaceReferenceLocator: vi.fn(),
  startSourceUpload: vi.fn(),
}));
vi.mock("@/features/sources/ingestion/service", () => ({ startSourceIngestion: vi.fn() }));
vi.mock("@/features/workspaces/source-deletion.server", () => ({
  deleteWorkspaceSource: vi.fn(),
}));

const actor = { principalId: "principal-id", handle: "developer" };
const mockedGetCurrentActor = vi.mocked(getCurrentActor);
const mockedAddWorkspaceReference = vi.mocked(addWorkspaceReference);
const mockedListWorkspaceReferenceCandidates = vi.mocked(listWorkspaceReferenceCandidates);
const mockedListWorkspaceSources = vi.mocked(listWorkspaceSources);
const mockedResolveWorkspaceReferenceLocator = vi.mocked(resolveWorkspaceReferenceLocator);
const mockedStartSourceUpload = vi.mocked(startSourceUpload);
const mockedStartSourceIngestion = vi.mocked(startSourceIngestion);
const mockedDeleteWorkspaceSource = vi.mocked(deleteWorkspaceSource);

beforeEach(() => {
  mockedGetCurrentActor.mockReset().mockResolvedValue(actor);
  mockedAddWorkspaceReference.mockReset();
  mockedListWorkspaceReferenceCandidates.mockReset();
  mockedListWorkspaceSources.mockReset();
  mockedResolveWorkspaceReferenceLocator.mockReset();
  mockedStartSourceUpload.mockReset();
  mockedStartSourceIngestion.mockReset();
  mockedDeleteWorkspaceSource.mockReset();
});

test("resolves the Actor before starting Source ingestion", async () => {
  const ingestion = {
    id: "0198ebec-17f0-7500-8000-000000000003",
    provider: "mineru" as const,
    state: "queued" as const,
    attemptNumber: 1,
    retryable: false,
    errorCode: null,
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
  mockedStartSourceIngestion.mockResolvedValue(ingestion);

  await expect(startSourceIngestionAction("source-id")).resolves.toEqual({
    ok: true,
    data: ingestion,
  });
  expect(mockedStartSourceIngestion).toHaveBeenCalledWith(actor, "source-id");
});

test("resolves the Actor on the server before listing Sources", async () => {
  mockedListWorkspaceSources.mockResolvedValue([]);

  await expect(listSourcesAction("workspace-id")).resolves.toEqual({ ok: true, data: [] });
  expect(mockedListWorkspaceSources).toHaveBeenCalledWith(actor, "workspace-id");
});

test("lists and adds Workspace references with server-resolved ownership", async () => {
  const targetWorkspaceId = "0198ebec-17f0-7500-8000-000000000005";
  const candidates = {
    candidates: [
      {
        id: targetWorkspaceId,
        name: "Course B",
        ownerHandle: "developer",
        relationship: "owned" as const,
        canonicalHref: "/developer/course-b",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    ],
    totalOtherWorkspaces: 1,
  };
  const reference = {
    id: "0198ebec-17f0-7500-8000-000000000006",
    workspaceId: "0198ebec-17f0-7500-8000-000000000007",
    kind: "workspaceReference" as const,
    accessState: "available" as const,
    targetWorkspace: {
      id: targetWorkspaceId,
      name: "Course B",
      ownerHandle: "developer",
      canonicalHref: "/developer/course-b",
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
  mockedListWorkspaceReferenceCandidates.mockResolvedValue(candidates);
  mockedAddWorkspaceReference.mockResolvedValue(reference);

  await expect(listWorkspaceReferenceCandidatesAction("workspace-id")).resolves.toEqual({
    ok: true,
    data: candidates,
  });
  await expect(addWorkspaceReferenceAction("workspace-id", targetWorkspaceId)).resolves.toEqual({
    ok: true,
    data: reference,
  });
  expect(mockedListWorkspaceReferenceCandidates).toHaveBeenCalledWith(actor, "workspace-id");
  expect(mockedAddWorkspaceReference).toHaveBeenCalledWith(
    actor,
    "workspace-id",
    targetWorkspaceId,
  );
});

test("resolves a workspace locator with the server Actor", async () => {
  const resolution = {
    candidate: {
      id: "0198ebec-17f0-7500-8000-000000000005",
      name: "Course B",
      ownerHandle: "developer",
      relationship: "owned" as const,
      canonicalHref: "/developer/course-b",
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
    resolvedFromRedirect: true,
  };
  mockedResolveWorkspaceReferenceLocator.mockResolvedValue(resolution);

  await expect(
    resolveWorkspaceReferenceLocatorAction("workspace-id", "developer/old-course-b"),
  ).resolves.toEqual({ ok: true, data: resolution });
  expect(mockedResolveWorkspaceReferenceLocator).toHaveBeenCalledWith(
    actor,
    "workspace-id",
    "developer/old-course-b",
  );
});

test("rejects an invalid workspace locator before resolving the Actor", async () => {
  await expect(resolveWorkspaceReferenceLocatorAction("workspace-id", "   ")).resolves.toEqual({
    ok: false,
    code: "source_input_invalid",
  });
  expect(mockedResolveWorkspaceReferenceLocator).not.toHaveBeenCalled();
});

test("rejects an invalid Workspace reference target before resolving the Actor", async () => {
  await expect(addWorkspaceReferenceAction("workspace-id", "not-a-uuid")).resolves.toEqual({
    ok: false,
    code: "source_input_invalid",
  });
  expect(mockedAddWorkspaceReference).not.toHaveBeenCalled();
});

test("resolves the Actor before deleting a Source through the Workspace adapter", async () => {
  mockedDeleteWorkspaceSource.mockResolvedValue({ cleanupPending: true });

  await expect(deleteSourceAction("source-id")).resolves.toEqual({
    ok: true,
    data: { cleanupPending: true },
  });
  expect(mockedDeleteWorkspaceSource).toHaveBeenCalledWith(actor, "source-id");
});

test("returns a stable Source error code", async () => {
  mockedListWorkspaceSources.mockRejectedValue(new SourceError("source_not_found"));

  await expect(listSourcesAction("workspace-id")).resolves.toEqual({
    ok: false,
    code: "source_not_found",
  });
});

test("does not expose validation details to the client", async () => {
  await expect(
    startSourceUploadAction("workspace-id", {
      originalFilename: "notes.pdf",
      declaredSizeBytes: 1024,
      ownerId: "forged-owner",
    }),
  ).resolves.toEqual({ ok: false, code: "source_input_invalid" });
  expect(mockedStartSourceUpload).not.toHaveBeenCalled();
});
