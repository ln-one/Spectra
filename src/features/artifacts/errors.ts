export class ArtifactError extends Error {
  constructor(
    readonly code:
      | "artifact_creation_conflict"
      | "artifact_not_found"
      | "artifact_proposal_conflict"
      | "artifact_proposal_invalid"
      | "artifact_revision_conflict",
  ) {
    super(code);
    this.name = "ArtifactError";
  }
}

export function isArtifactError(
  error: unknown,
  code: ArtifactError["code"],
): error is ArtifactError {
  return (
    error instanceof Error &&
    error.name === "ArtifactError" &&
    error.message === code &&
    Reflect.get(error, "code") === code
  );
}
