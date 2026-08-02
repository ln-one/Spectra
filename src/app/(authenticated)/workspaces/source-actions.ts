"use server";

import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import type { SourceActionResult } from "@/features/sources/client-actions";
import { SourceError } from "@/features/sources/errors";
import { startSourceIngestion } from "@/features/sources/ingestion/service";
import {
  addWorkspaceReference,
  completeSourceUpload,
  listWorkspaceReferenceCandidates,
  listWorkspaceSources,
  prepareSourceUpload,
  resolveWorkspaceReferenceLocator,
  startSourceUpload,
} from "@/features/sources/service";
import type {
  Source,
  SourceDeletionResult,
  SourceIngestion,
  SourceUploadTarget,
  UploadedFileSource,
  WorkspaceReferenceCandidateList,
  WorkspaceReferenceResolution,
  WorkspaceReferenceSource,
} from "@/features/sources/types";
import {
  sourceUploadIntentSchema,
  workspaceReferenceIntentSchema,
} from "@/features/sources/validation";
import { deleteWorkspaceSource } from "@/features/workspaces/source-deletion.server";

async function runSourceAction<T>(operation: () => Promise<T>): Promise<SourceActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof IdentityError || error instanceof SourceError) {
      return { ok: false, code: error.code };
    }
    return { ok: false, code: "source_action_failed" };
  }
}

export async function listSourcesAction(
  workspaceId: string,
): Promise<SourceActionResult<Source[]>> {
  return runSourceAction(async () => listWorkspaceSources(await getCurrentActor(), workspaceId));
}

export async function listWorkspaceReferenceCandidatesAction(
  workspaceId: string,
): Promise<SourceActionResult<WorkspaceReferenceCandidateList>> {
  return runSourceAction(async () =>
    listWorkspaceReferenceCandidates(await getCurrentActor(), workspaceId),
  );
}

export async function resolveWorkspaceReferenceLocatorAction(
  workspaceId: string,
  locator: unknown,
): Promise<SourceActionResult<WorkspaceReferenceResolution>> {
  if (typeof locator !== "string" || locator.trim().length === 0 || locator.length > 2048) {
    return { ok: false, code: "source_input_invalid" };
  }
  return runSourceAction(async () =>
    resolveWorkspaceReferenceLocator(await getCurrentActor(), workspaceId, locator),
  );
}

export async function addWorkspaceReferenceAction(
  workspaceId: string,
  targetWorkspaceId: unknown,
): Promise<SourceActionResult<WorkspaceReferenceSource>> {
  const payload = workspaceReferenceIntentSchema.safeParse({ targetWorkspaceId });
  if (!payload.success) return { ok: false, code: "source_input_invalid" };
  return runSourceAction(async () =>
    addWorkspaceReference(await getCurrentActor(), workspaceId, payload.data.targetWorkspaceId),
  );
}

export async function startSourceUploadAction(
  workspaceId: string,
  input: unknown,
): Promise<SourceActionResult<SourceUploadTarget>> {
  const payload = sourceUploadIntentSchema.safeParse(input);
  if (!payload.success) return { ok: false, code: "source_input_invalid" };
  return runSourceAction(async () =>
    startSourceUpload(await getCurrentActor(), workspaceId, payload.data),
  );
}

export async function prepareSourceUploadAction(
  sourceId: string,
): Promise<SourceActionResult<SourceUploadTarget>> {
  return runSourceAction(async () => prepareSourceUpload(await getCurrentActor(), sourceId));
}

export async function completeSourceUploadAction(
  sourceId: string,
  generation: number,
): Promise<SourceActionResult<UploadedFileSource>> {
  return runSourceAction(async () =>
    completeSourceUpload(await getCurrentActor(), sourceId, generation),
  );
}

export async function startSourceIngestionAction(
  sourceId: string,
): Promise<SourceActionResult<SourceIngestion>> {
  return runSourceAction(async () => startSourceIngestion(await getCurrentActor(), sourceId));
}

export async function deleteSourceAction(
  sourceId: string,
): Promise<SourceActionResult<SourceDeletionResult>> {
  return runSourceAction(async () => deleteWorkspaceSource(await getCurrentActor(), sourceId));
}
