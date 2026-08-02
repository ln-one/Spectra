import {
  type ArtifactGenerationOutcome,
  type ArtifactProjection,
  hasVisibleArtifactOutput,
} from "@/features/artifacts/generation";
import {
  createMindMapSnapshotProjector,
  type MindMapRevisionContent,
  mindMapDraftSchema,
  mindMapRevisionContentSchema,
} from "./contract";

function parseJson(rawOutput: string) {
  const unfenced = rawOutput
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    return null;
  }
}

export function createIncrementalMindMapProjector(idFactory: () => string) {
  const projectTree = createMindMapSnapshotProjector(idFactory);
  return (rawOutput: string) => {
    const parsed = mindMapDraftSchema.safeParse(parseJson(rawOutput));
    return parsed.success ? projectTree(parsed.data) : null;
  };
}

export function projectMindMap(input: {
  idFactory?: () => string;
  outcome: ArtifactGenerationOutcome;
  rawOutput: string;
}): ArtifactProjection<MindMapRevisionContent> {
  if (!hasVisibleArtifactOutput(input.rawOutput)) throw new Error("mind_map_invalid_output");
  let idIndex = 0;
  const idFactory = input.idFactory ?? (() => `node-${++idIndex}`);
  const parsed = mindMapDraftSchema.safeParse(parseJson(input.rawOutput));
  const structured = parsed.success ? createMindMapSnapshotProjector(idFactory)(parsed.data) : null;
  if (!structured) throw new Error("mind_map_invalid_output");
  const warnings = input.outcome === "partial" ? (["partial_generation"] as const) : [];
  const generation = {
    outcome: input.outcome,
    rawOutput: input.rawOutput,
    warnings: [...warnings],
  };
  const revision = mindMapRevisionContentSchema.parse({
    ...structured,
    generation,
    schemaVersion: 2,
  });
  return { ...generation, revision };
}
