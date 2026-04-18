import type { ResolvedArtifactPayload } from "../../types";
import type { AnimationArtifactRuntimeSnapshot } from "./types";

export interface AnimationRenderable {
  artifactId: string | null;
  snapshot: AnimationArtifactRuntimeSnapshot | null;
  artifactType: string | null;
}

export function resolveAnimationRenderable(
  artifact: ResolvedArtifactPayload | null | undefined,
  snapshot: AnimationArtifactRuntimeSnapshot | null
): AnimationRenderable {
  return {
    artifactId: artifact?.artifactId ?? null,
    artifactType: artifact?.artifactType ?? null,
    snapshot,
  };
}
