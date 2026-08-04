import type { KnowledgeCitationEvidence } from "@/features/agents/knowledge-citation-contract";
import type { KnowledgeNetworkTrace } from "./model";
import { stableWorkspacePath } from "./model";

function locatorLabel(evidence: KnowledgeCitationEvidence) {
  const locator = evidence.locator;
  switch (locator.kind) {
    case "text_range":
      return `${locator.start}–${locator.end}`;
    case "page_region":
      return `P${locator.pageIndex + 1}`;
    case "page_regions":
      return locator.regions.map((region) => `P${region.pageIndex + 1}`).join(", ");
    case "grid_range":
      return `${locator.sheetId}!${locator.range}`;
    case "structured_path":
      return locator.path || "/";
    case "cue_range":
    case "media_range":
      return `${(locator.startMs / 1000).toFixed(1)}s–${(locator.endMs / 1000).toFixed(1)}s`;
    case "notebook_cell":
      return locator.cellId;
    case "code_range":
      return `L${locator.startLine}–${locator.endLine}`;
  }
}

export function mergeKnowledgeNetworkCitation(
  trace: KnowledgeNetworkTrace,
  evidence: KnowledgeCitationEvidence,
): KnowledgeNetworkTrace {
  const source = trace.sources.find((candidate) => candidate.id === evidence.sourceId);
  if (!source) return trace;
  if (evidence.workspaceOrigin && evidence.workspaceOrigin.workspaceId !== source.workspaceId) {
    return trace;
  }

  const existingChunk = trace.chunks.find((chunk) => chunk.id === evidence.evidenceId);
  const chunk = existingChunk ?? {
    id: evidence.evidenceId,
    sourceId: source.id,
    label:
      evidence.exactExcerpt?.slice(0, 120) ??
      (evidence.content.kind === "visual_region"
        ? (evidence.content.accessibleDescription?.slice(0, 120) ?? evidence.sourceName)
        : evidence.sourceName),
    locator: locatorLabel(evidence),
    rank: evidence.citationNumber,
  };
  const workspaceIds =
    trace.paths.find((path) => path.sourceId === source.id)?.workspaceIds ??
    stableWorkspacePath(trace, source.workspaceId);
  if (!workspaceIds || workspaceIds.at(-1) !== source.workspaceId) return trace;

  const nextPaths = trace.paths.some((path) => path.chunkId === chunk.id)
    ? trace.paths
    : [
        ...trace.paths,
        {
          id: `path:${trace.id}:${chunk.id}`,
          workspaceIds: [...workspaceIds],
          sourceId: source.id,
          chunkId: chunk.id,
        },
      ];
  return {
    ...trace,
    chunks: existingChunk ? trace.chunks : [...trace.chunks, chunk],
    paths: nextPaths,
    selectedChunkIds: trace.selectedChunkIds.includes(chunk.id)
      ? trace.selectedChunkIds
      : [...trace.selectedChunkIds, chunk.id],
    citedChunkIds: trace.citedChunkIds.includes(chunk.id)
      ? trace.citedChunkIds
      : [...trace.citedChunkIds, chunk.id],
  };
}
