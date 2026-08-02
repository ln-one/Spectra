export type CreateWorkspaceFormState = {
  code: "workspace_input_invalid" | "workspace_creation_failed";
} | null;

export type CreateWorkspaceFormAction = (
  state: CreateWorkspaceFormState,
  formData: FormData,
) => Promise<CreateWorkspaceFormState>;
