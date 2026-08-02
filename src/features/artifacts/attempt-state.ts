import { z } from "zod";

const artifactGenerationAttemptStateSchema = z.enum([
  "queued",
  "running",
  "submitted",
  "failed",
  "cancelled",
]);

const artifactProviderAttemptStateSchema = z.enum(["running", "succeeded", "failed", "exhausted"]);

export type ArtifactGenerationAttemptState = z.infer<typeof artifactGenerationAttemptStateSchema>;
export type ArtifactProviderAttemptState = z.infer<typeof artifactProviderAttemptStateSchema>;

const generationTransitions = {
  queued: ["running", "failed", "cancelled"],
  running: ["submitted", "failed", "cancelled"],
  submitted: [],
  failed: [],
  cancelled: [],
} as const satisfies Record<
  ArtifactGenerationAttemptState,
  readonly ArtifactGenerationAttemptState[]
>;

const providerTransitions = {
  running: ["succeeded", "failed", "exhausted"],
  succeeded: [],
  failed: [],
  exhausted: [],
} as const satisfies Record<ArtifactProviderAttemptState, readonly ArtifactProviderAttemptState[]>;

export class InvalidArtifactAttemptTransitionError extends Error {
  readonly code = "invalid_artifact_attempt_transition";

  constructor(entity: string, from: string, to: string) {
    super(`${entity} cannot transition from ${from} to ${to}`);
    this.name = "InvalidArtifactAttemptTransitionError";
  }
}

export function transitionArtifactGenerationAttempt(
  from: unknown,
  to: Exclude<ArtifactGenerationAttemptState, "queued">,
) {
  const current = artifactGenerationAttemptStateSchema.parse(from);
  if (!(generationTransitions[current] as readonly ArtifactGenerationAttemptState[]).includes(to)) {
    throw new InvalidArtifactAttemptTransitionError("Artifact generation attempt", current, to);
  }
  return to;
}

export function transitionArtifactProviderAttempt(
  from: unknown,
  to: Exclude<ArtifactProviderAttemptState, "running">,
) {
  const current = artifactProviderAttemptStateSchema.parse(from);
  if (!(providerTransitions[current] as readonly ArtifactProviderAttemptState[]).includes(to)) {
    throw new InvalidArtifactAttemptTransitionError("Artifact provider attempt", current, to);
  }
  return to;
}
