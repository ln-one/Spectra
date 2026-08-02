import type { ArtifactGenerationState } from "./types";

const artifactGenerationTransitions = {
  queued: ["generating", "failed", "cancelled"],
  generating: ["generating", "finalizing", "failed", "cancelled"],
  finalizing: ["finalizing", "ready", "failed", "cancelled"],
  ready: ["cancelled"],
  failed: ["queued", "cancelled"],
  cancelled: ["cancelled"],
} as const satisfies Record<ArtifactGenerationState, readonly ArtifactGenerationState[]>;

export class InvalidArtifactGenerationTransitionError extends Error {
  readonly code = "invalid_artifact_generation_transition";

  constructor(from: ArtifactGenerationState, to: ArtifactGenerationState) {
    super(`Artifact generation cannot transition from ${from} to ${to}`);
    this.name = "InvalidArtifactGenerationTransitionError";
  }
}

export function transitionArtifactGeneration(
  from: ArtifactGenerationState,
  to: ArtifactGenerationState,
) {
  if (!(artifactGenerationTransitions[from] as readonly ArtifactGenerationState[]).includes(to)) {
    throw new InvalidArtifactGenerationTransitionError(from, to);
  }
  return to;
}
