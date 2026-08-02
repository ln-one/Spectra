import { sortArtifactHistory } from "@/features/artifacts/artifact-history";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import type { ArtifactSource, Source } from "@/features/sources/types";

type ArtifactMembershipLists = {
  history: ArtifactHistoryItem[];
  sources: Source[];
};

export function moveArtifactIntoSources(
  history: readonly ArtifactHistoryItem[],
  sources: readonly Source[],
  source: ArtifactSource,
): ArtifactMembershipLists {
  return {
    history: history.filter((item) => item.id !== source.artifact.id),
    sources: [
      ...sources.filter((item) => item.kind === "workspaceReference"),
      ...sources.filter(
        (item) => item.kind === "artifact" && item.artifact.id !== source.artifact.id,
      ),
      source,
      ...sources.filter((item) => item.kind === "uploadedFile"),
    ],
  };
}

export function moveArtifactIntoHistory(
  history: readonly ArtifactHistoryItem[],
  sources: readonly Source[],
  source: ArtifactSource,
): ArtifactMembershipLists {
  const historyItem: ArtifactHistoryItem = {
    id: source.artifact.id,
    kind: source.artifact.kind,
    title: source.artifact.title,
    generationState: source.artifact.generationState,
    currentRevisionId: source.artifact.currentRevision.id,
    createdAt: source.artifact.createdAt,
    updatedAt: source.artifact.updatedAt,
  };
  return {
    history: sortArtifactHistory([
      ...history.filter((item) => item.id !== historyItem.id),
      historyItem,
    ]),
    sources: sources.filter((item) => item.id !== source.id),
  };
}
