import type { IdentityErrorCode } from "@/features/identity/errors";
import type { SourceErrorCode } from "./errors";
import type {
  Source,
  SourceDeletionResult,
  SourceIngestion,
  SourceUploadTarget,
  UploadedFileSource,
  WorkspaceReferenceCandidateList,
  WorkspaceReferenceResolution,
  WorkspaceReferenceSource,
} from "./types";
import type { SourceUploadIntent } from "./validation";

export type SourceActionErrorCode =
  | IdentityErrorCode
  | SourceErrorCode
  | "source_input_invalid"
  | "source_action_failed";

export type SourceActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: SourceActionErrorCode };

export type SourceClientActions = {
  list: (workspaceId: string) => Promise<SourceActionResult<Source[]>>;
  listReferenceCandidates: (
    workspaceId: string,
  ) => Promise<SourceActionResult<WorkspaceReferenceCandidateList>>;
  resolveReferenceLocator: (
    workspaceId: string,
    locator: string,
  ) => Promise<SourceActionResult<WorkspaceReferenceResolution>>;
  addReference: (
    workspaceId: string,
    targetWorkspaceId: string,
  ) => Promise<SourceActionResult<WorkspaceReferenceSource>>;
  start: (
    workspaceId: string,
    input: SourceUploadIntent,
  ) => Promise<SourceActionResult<SourceUploadTarget>>;
  prepare: (sourceId: string) => Promise<SourceActionResult<SourceUploadTarget>>;
  complete: (
    sourceId: string,
    generation: number,
  ) => Promise<SourceActionResult<UploadedFileSource>>;
  ingest: (sourceId: string) => Promise<SourceActionResult<SourceIngestion>>;
  remove: (sourceId: string) => Promise<SourceActionResult<SourceDeletionResult>>;
};
