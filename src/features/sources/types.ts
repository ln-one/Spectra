import type { ArtifactGenerationState, ArtifactSourceKind } from "@/features/artifacts/types";
import type { SourceErrorCode } from "./errors";
import type { SourceIngestionProvider } from "./validation";

export type FileSourceState = "pending_upload" | "stored" | "failed";
export type SourceIngestionState = "queued" | "processing" | "ready" | "failed" | "obsolete";
export type SourceKnowledgeIndexState =
  | "queued"
  | "projecting"
  | "publishing"
  | "ready"
  | "failed"
  | "obsolete";
export const sourceIngestionErrorCodes = [
  "source_not_stored",
  "source_ingestion_unavailable",
  "architecture_reset",
  "provider_submission_unknown",
  "mineru_unavailable",
  "mineru_timeout",
  "mineru_resource_limit",
  "mineru_quota_exceeded",
  "mineru_authentication",
  "mineru_input_rejected",
  "mineru_task_not_found",
  "mineru_provider_failed",
  "mineru_result_invalid",
  "media_authentication",
  "media_rate_limited",
  "media_input_rejected",
  "media_timeout",
  "media_unavailable",
  "media_result_invalid",
  "media_aborted",
  "native_input_rejected",
] as const;
export type SourceIngestionErrorCode = (typeof sourceIngestionErrorCodes)[number];

export type SourceIngestion = {
  id: string;
  provider: SourceIngestionProvider;
  state: SourceIngestionState;
  attemptNumber: number;
  retryable: boolean;
  errorCode: SourceIngestionErrorCode | null;
  updatedAt: string;
};

export type SourceKnowledgeIndex = {
  state: SourceKnowledgeIndexState;
  chunkCount: number;
  failureCode: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  updatedAt: string;
};

export type UploadedFileSource = {
  id: string;
  workspaceId: string;
  kind: "uploadedFile";
  originalFilename: string;
  sizeBytes: number;
  state: FileSourceState;
  failureCode: SourceErrorCode | null;
  uploadGeneration: number;
  uploadExpiresAt: string | null;
  ingestion: SourceIngestion | null;
  knowledgeIndex?: SourceKnowledgeIndex;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceReferenceSourceBase = {
  id: string;
  workspaceId: string;
  kind: "workspaceReference";
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceReferenceSource =
  | (WorkspaceReferenceSourceBase & {
      accessState: "available";
      targetWorkspace: {
        id: string;
        name: string;
        ownerHandle: string;
        canonicalHref: string;
        updatedAt: string;
      };
    })
  | (WorkspaceReferenceSourceBase & {
      accessState: "unavailable";
    });

export type WorkspaceReferenceCandidate = {
  id: string;
  name: string;
  ownerHandle: string;
  relationship: "owned" | "shared" | "public";
  canonicalHref: string;
  updatedAt: string;
};

export type WorkspaceReferenceCandidateList = {
  candidates: WorkspaceReferenceCandidate[];
  totalOtherWorkspaces: number;
};

export type WorkspaceReferenceResolution = {
  candidate: WorkspaceReferenceCandidate;
  resolvedFromRedirect: boolean;
};

export type ArtifactSource = {
  id: string;
  workspaceId: string;
  kind: "artifact";
  artifact: {
    id: string;
    kind: ArtifactSourceKind;
    title: string;
    conversationId: string;
    generationState: ArtifactGenerationState;
    createdAt: string;
    updatedAt: string;
    currentRevision: {
      id: string;
      revisionNumber: number;
    };
  };
  knowledgeIndex?: SourceKnowledgeIndex;
  createdAt: string;
  updatedAt: string;
};

export type Source = UploadedFileSource | WorkspaceReferenceSource | ArtifactSource;

export type SourceUploadTarget = {
  source: UploadedFileSource;
  upload: {
    method: "PUT";
    url: string;
    generation: number;
    expiresAt: string;
  };
};

export type SourceDeletionResult = {
  cleanupPending: boolean;
};
