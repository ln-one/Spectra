import "server-only";

import { artifactCreationCapabilities } from "@/features/artifacts/task-agent/config.server";
import type { ArtifactCreationCapabilities } from "@/features/artifacts/task-agent/creation-capabilities";
import {
  type ArtifactToolDependencies,
  artifactAgentComposition,
  createArtifactCommandAdapters,
} from "./artifact-composition.server";
import {
  type ArtifactPlanToolRuntime,
  createArtifactCreationTools,
} from "./artifact-create-tools.server";
import { createArtifactEditTools } from "./artifact-edit-tools.server";
import { createArtifactReadTools } from "./artifact-read-tools.server";

export type { ArtifactToolDependencies } from "./artifact-composition.server";

export function createWorkspaceArtifactAgentTools(
  dependencyOverrides: Partial<ArtifactToolDependencies> = {},
  options: {
    artifactCreationCapabilities?: ArtifactCreationCapabilities;
    artifactPlanRuntime?: ArtifactPlanToolRuntime;
  } = {},
) {
  const dependencies = {
    ...artifactAgentComposition,
    ...dependencyOverrides,
  };
  const capabilities = options.artifactCreationCapabilities ?? artifactCreationCapabilities();
  const commandAdapters = createArtifactCommandAdapters(dependencies);

  return {
    ...createArtifactReadTools({ commandAdapters, dependencies }),
    ...createArtifactCreationTools({
      capabilities,
      dependencies,
      ...(options.artifactPlanRuntime ? { planRuntime: options.artifactPlanRuntime } : {}),
    }),
    ...createArtifactEditTools({ commandAdapters, dependencies }),
  };
}
