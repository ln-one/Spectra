export type WorkspaceRenameFormState =
  | { status: "success"; workspaceName: string }
  | {
      status: "error";
      code: "workspace_name_invalid" | "workspace_not_found" | "workspace_rename_failed";
    }
  | null;

export type WorkspaceRenameFormAction = (
  state: WorkspaceRenameFormState,
  formData: FormData,
) => Promise<WorkspaceRenameFormState>;

export type WorkspaceArchiveFormState =
  | { status: "success"; operation: "archive" | "restore"; workspaceName: string }
  | { status: "error"; code: "workspace_not_found" | "workspace_archive_failed" }
  | null;

export type WorkspaceArchiveFormAction = (
  state: WorkspaceArchiveFormState,
  formData: FormData,
) => Promise<WorkspaceArchiveFormState>;
