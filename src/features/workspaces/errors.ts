export type WorkspaceErrorCode =
  | "workspace_not_found"
  | "workspace_slug_conflict"
  | "workspace_slug_required"
  | "workspace_invitee_not_found";

export class WorkspaceError extends Error {
  constructor(readonly code: WorkspaceErrorCode) {
    super(code);
    this.name = "WorkspaceError";
  }
}
