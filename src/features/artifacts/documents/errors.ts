export type TeachingDocumentErrorCode =
  | "teaching_document_not_found"
  | "teaching_document_conflict"
  | "teaching_document_invalid"
  | "teaching_document_proposal_invalid"
  | "teaching_document_proposal_stale";

export class TeachingDocumentError extends Error {
  constructor(readonly code: TeachingDocumentErrorCode) {
    super(code);
    this.name = "TeachingDocumentError";
  }
}
