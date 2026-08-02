export class PresentationError extends Error {
  constructor(
    readonly code:
      | "presentation_editor_project_invalid"
      | "presentation_not_found"
      | "presentation_not_retryable"
      | "presentation_revision_conflict"
      | "presentation_refinement_invalid"
      | "presentation_refinement_stale"
      | "presentation_source_unavailable"
      | "presentation_runtime_unavailable",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "PresentationError";
  }
}
