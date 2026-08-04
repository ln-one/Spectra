import "server-only";

import type { UIMessage } from "ai";
import {
  extractKnowledgeEvidence,
  type KnowledgeCitationEvidence,
  referencedKnowledgeCitationTokens,
} from "@/features/agents/knowledge-citation-contract";
import { artifactPresentation } from "@/features/artifacts/ui/artifact-presentation";
import type { Actor } from "@/features/identity/types";
import { type SourceVisualFamily, sourceVisualFamily } from "@/features/sources/presentation";
import { listWorkspaceSources } from "@/features/sources/service";
import type { Source } from "@/features/sources/types";
import { resolveReachableWorkspaceGraph } from "@/features/workspaces/reference-graph";
import type { Workspace } from "@/features/workspaces/types";
import type {
  KnowledgeNetworkChunk,
  KnowledgeNetworkPath,
  KnowledgeNetworkSource,
  KnowledgeNetworkTrace,
  KnowledgeNetworkWorkspace,
} from "./model";

function sourceName(source: Source) {
  if (source.kind === "uploadedFile") return source.originalFilename;
  if (source.kind === "artifact") return source.artifact.title;
  return null;
}

function sourceFamily(source: Source): Exclude<SourceVisualFamily, "workspace"> {
  const name = sourceName(source);
  return name ? sourceVisualFamily(name) : "neutral";
}

function familyLabel(family: Exclude<SourceVisualFamily, "workspace">) {
  switch (family) {
    case "pdf":
      return "PDF";
    case "document":
      return "Document";
    case "presentation":
      return "Presentation";
    case "spreadsheet":
      return "Spreadsheet";
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "code":
      return "Code";
    case "text":
      return "Text";
    case "table":
      return "Table";
    case "structured":
      return "Structured data";
    case "captions":
      return "Captions";
    case "notebook":
      return "Notebook";
    case "neutral":
      return "Source";
  }
}

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

function evidenceLabel(evidence: KnowledgeCitationEvidence) {
  if (evidence.exactExcerpt) return evidence.exactExcerpt.slice(0, 120);
  if (evidence.content.kind === "visual_region") {
    return evidence.content.accessibleDescription?.slice(0, 120) ?? evidence.sourceName;
  }
  return evidence.sourceName;
}

function sourceDetail(source: Source, family: Exclude<SourceVisualFamily, "workspace">) {
  const chunkCount =
    source.kind === "workspaceReference" ? 0 : (source.knowledgeIndex?.chunkCount ?? 0);
  return `${familyLabel(family)} · ${chunkCount} chunks`;
}

function knowledgeNetworkSource(source: Source): KnowledgeNetworkSource | null {
  const name = sourceName(source);
  if (!name || source.kind === "workspaceReference") return null;
  const family = sourceFamily(source);
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    name,
    detail: sourceDetail(source, family),
    family,
    ...(source.kind === "artifact"
      ? {
          artifactKind: source.artifact.kind,
          artifactTone: artifactPresentation(source.artifact.kind).tone,
        }
      : {}),
    chunkCount: source.knowledgeIndex?.chunkCount ?? 0,
  };
}

function knowledgeNetworkChunk(evidence: KnowledgeCitationEvidence): KnowledgeNetworkChunk {
  return {
    id: evidence.evidenceId,
    sourceId: evidence.sourceId,
    label: evidenceLabel(evidence),
    locator: locatorLabel(evidence),
    rank: evidence.citationNumber,
  };
}

function validEvidencePath(
  evidence: KnowledgeCitationEvidence,
  source: KnowledgeNetworkSource,
  pathByWorkspaceId: ReadonlyMap<string, string[]>,
) {
  if (evidence.workspaceOrigin && evidence.workspaceOrigin.workspaceId !== source.workspaceId) {
    return null;
  }
  const workspaceIds = pathByWorkspaceId.get(source.workspaceId);
  if (!workspaceIds || workspaceIds.at(-1) !== source.workspaceId) return null;
  return workspaceIds;
}

export async function buildRealKnowledgeNetworkTrace({
  actor,
  conversationId,
  initialMessages,
  initialSources,
  workspace,
}: {
  actor: Actor;
  conversationId: string;
  initialMessages: readonly UIMessage[];
  initialSources: readonly Source[];
  workspace: Workspace;
}): Promise<KnowledgeNetworkTrace> {
  const graph = await resolveReachableWorkspaceGraph(actor, workspace.id);
  const sourcesByWorkspace = new Map<string, Source[]>();
  await Promise.all(
    graph.nodes.map(async (node) => {
      const sources =
        node.id === workspace.id ? [...initialSources] : await listWorkspaceSources(actor, node.id);
      sourcesByWorkspace.set(node.id, sources);
    }),
  );

  const sources = graph.nodes.flatMap((node) =>
    (sourcesByWorkspace.get(node.id) ?? []).flatMap((source) => {
      const networkSource = knowledgeNetworkSource(source);
      return networkSource ? [networkSource] : [];
    }),
  );
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const pathByWorkspaceId = new Map(
    graph.paths.map((path) => [path.workspaceId, [...path.workspaceIds]]),
  );
  const evidence = extractKnowledgeEvidence(
    initialMessages.flatMap((message) => message.parts ?? []),
  );
  const referencedTokens = referencedKnowledgeCitationTokens(
    initialMessages.flatMap((message) => message.parts ?? []),
  );
  const chunks: KnowledgeNetworkChunk[] = [];
  const paths: KnowledgeNetworkPath[] = [];
  const selectedChunkIds: string[] = [];
  const citedChunkIds: string[] = [];

  for (const item of evidence) {
    const source = sourceById.get(item.sourceId);
    if (!source) continue;
    const workspaceIds = validEvidencePath(item, source, pathByWorkspaceId);
    if (!workspaceIds) continue;
    const chunk = knowledgeNetworkChunk(item);
    chunks.push(chunk);
    paths.push({
      id: `path:${conversationId}:${item.evidenceId}`,
      workspaceIds,
      sourceId: source.id,
      chunkId: chunk.id,
    });
    selectedChunkIds.push(chunk.id);
    if (referencedTokens.has(item.citationToken)) citedChunkIds.push(chunk.id);
  }

  const workspaces: KnowledgeNetworkWorkspace[] = graph.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    detail: `${node.id === workspace.id ? "Current" : "Referenced"} Workspace · ${(sourcesByWorkspace.get(node.id) ?? []).filter((source) => source.kind !== "workspaceReference").length} sources`,
    relation: node.id === workspace.id ? "current" : "referenced",
  }));

  return {
    id: `workspace:${workspace.id}:conversation:${conversationId}`,
    query: workspace.name,
    currentWorkspaceId: workspace.id,
    workspaces,
    references: graph.edges.map((edge) => ({
      id: edge.sourceId,
      sourceWorkspaceId: edge.sourceWorkspaceId,
      targetWorkspaceId: edge.targetWorkspaceId,
    })),
    sources,
    chunks,
    paths,
    selectedChunkIds,
    citedChunkIds,
  };
}
