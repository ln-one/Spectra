export const sourceErrorCodes = [
  "source_not_found",
  "source_file_type_unsupported",
  "source_file_too_large",
  "source_workspace_quota_exceeded",
  "source_upload_expired",
  "source_upload_incomplete",
  "source_upload_mismatch",
  "source_invalid_state",
  "source_storage_unavailable",
] as const;

export type SourceErrorCode = (typeof sourceErrorCodes)[number];

export class SourceError extends Error {
  constructor(readonly code: SourceErrorCode) {
    super(code);
    this.name = "SourceError";
  }
}
