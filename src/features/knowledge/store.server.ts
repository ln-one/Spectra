import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import {
  artifactSources,
  artifacts,
  fileSources,
  retrievalChunks,
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  retrievalRepresentationBlocks,
  sources,
  workspaces,
} from "@/database/schema";
import { artifactSourceKindSchema } from "@/features/artifacts/types";
import { sourcePresentationHintForFilename } from "@/features/sources/presentation";
import {
  requireSourceFormatCapabilities,
  sourceFileExtension,
} from "@/features/sources/validation";
import { WorkspaceError } from "@/features/workspaces/errors";
import {
  resolveReachableWorkspaceGraph,
  type WorkspaceReferenceGraph,
} from "@/features/workspaces/reference-graph";
import type { EvidenceUnit, KnowledgeChunk, RepresentationBlock } from "./contracts";
import { normalizeStoredKnowledgeContentHash } from "./integrity";
import type { KnowledgeStorePort } from "./ports";
import { evidenceContentSchema, evidenceFidelitySchema, evidenceLocatorSchema } from "./schemas";

function blockKind(value: string): RepresentationBlock["kind"] {
  if (
    value === "heading" ||
    value === "paragraph" ||
    value === "list" ||
    value === "table" ||
    value === "code" ||
    value === "quote" ||
    value === "thematic_break" ||
    value === "structured_node" ||
    value === "notebook_cell" ||
    value === "cue" ||
    value === "media_segment" ||
    value === "visual"
  ) {
    return value;
  }
  throw new Error("knowledge_block_kind_invalid");
}

function chunkFromRow(row: typeof retrievalChunks.$inferSelect): KnowledgeChunk {
  return {
    id: row.id,
    representationId: row.representationId,
    ordinal: row.ordinal,
    firstBlockOrdinal: row.firstBlockOrdinal,
    lastBlockOrdinal: row.lastBlockOrdinal,
    headingPath: row.headingPath,
    exactText: row.exactText,
    indexText: row.indexText,
    contentHash: row.contentHash,
    capacityUnits: row.capacityUnits,
  };
}

export function createKnowledgeStore(db: Database = database): KnowledgeStorePort {
  return {
    async authorizeAndSnapshot(actor, workspaceId) {
      let graph: WorkspaceReferenceGraph;
      try {
        graph = await resolveReachableWorkspaceGraph(actor, workspaceId, db);
      } catch (error) {
        if (error instanceof WorkspaceError && error.code === "workspace_not_found") {
          throw new Error("knowledge_workspace_not_found", { cause: error });
        }
        throw error;
      }
      const workspaceIds = graph.nodes.map((node) => node.id).sort();
      const generations = await db
        .select({
          id: retrievalIndexGenerations.id,
          collection: retrievalIndexGenerations.collectionName,
          manifestHash: retrievalIndexGenerations.manifestHash,
          sourceId: retrievalIndexGenerations.sourceId,
          originalFilename: fileSources.originalFilename,
          artifactTitle: artifacts.title,
        })
        .from(retrievalIndexGenerations)
        .innerJoin(sources, eq(retrievalIndexGenerations.sourceId, sources.id))
        .leftJoin(fileSources, eq(retrievalIndexGenerations.sourceId, fileSources.sourceId))
        .leftJoin(artifactSources, eq(retrievalIndexGenerations.sourceId, artifactSources.sourceId))
        .leftJoin(artifacts, eq(artifactSources.artifactId, artifacts.id))
        .where(
          and(
            inArray(retrievalIndexGenerations.workspaceId, workspaceIds),
            eq(retrievalIndexGenerations.state, "ready"),
            isNull(sources.deletedAt),
          ),
        )
        .orderBy(asc(retrievalIndexGenerations.id));
      if (generations.length === 0) throw new Error("knowledge_index_not_ready");
      for (const generation of generations) {
        if (generation.artifactTitle) continue;
        if (!generation.originalFilename) throw new Error("knowledge_source_name_missing");
        const format = sourceFileExtension(generation.originalFilename);
        if (!format) throw new Error("knowledge_source_format_invalid");
        requireSourceFormatCapabilities(format, ["project", "retrieve", "nativeLocator"]);
      }
      const snapshots = new Set(
        generations.map((generation) => `${generation.collection}\u0000${generation.manifestHash}`),
      );
      if (snapshots.size !== 1) throw new Error("knowledge_index_inconsistent");
      const generation = generations[0];
      if (!generation) throw new Error("knowledge_index_not_ready");
      return {
        collection: generation.collection,
        manifestHash: generation.manifestHash,
        generationIds: generations.map(({ id }) => id),
        referenceSourceIds: graph.edges.map((edge) => edge.sourceId).sort(),
        rootWorkspaceId: workspaceId,
        workspaceIds,
      };
    },
    async loadMaterials({ chunkIds, generationIds, rootWorkspaceId }) {
      if (chunkIds.length === 0) return new Map();
      if (generationIds.length === 0) throw new Error("knowledge_index_inconsistent");
      const chunks = await db
        .select({
          chunk: retrievalChunks,
          sourceName: sql<string>`coalesce(${artifacts.title}, ${fileSources.originalFilename})`,
          artifactKind: artifacts.kind,
          originalFilename: fileSources.originalFilename,
          workspaceId: sources.workspaceId,
          workspaceName: workspaces.name,
          state: retrievalIndexGenerations.state,
          sourceRevision: retrievalIndexGenerations.sourceRevision,
          representationHash: retrievalIndexGenerations.representationHash,
          representationAdapterId: retrievalIndexGenerations.representationAdapterId,
          representationAdapterVersion: retrievalIndexGenerations.representationAdapterVersion,
        })
        .from(retrievalChunks)
        .innerJoin(
          retrievalIndexGenerations,
          eq(retrievalChunks.indexGenerationId, retrievalIndexGenerations.id),
        )
        .innerJoin(sources, eq(retrievalChunks.sourceId, sources.id))
        .leftJoin(fileSources, eq(retrievalChunks.sourceId, fileSources.sourceId))
        .leftJoin(artifactSources, eq(retrievalChunks.sourceId, artifactSources.sourceId))
        .leftJoin(artifacts, eq(artifactSources.artifactId, artifacts.id))
        .innerJoin(workspaces, eq(sources.workspaceId, workspaces.id))
        .where(
          and(
            inArray(retrievalChunks.id, [...chunkIds]),
            inArray(retrievalChunks.indexGenerationId, [...generationIds]),
          ),
        );
      if (chunks.some((row) => row.state !== "ready" && row.state !== "obsolete"))
        throw new Error("knowledge_index_inconsistent");
      if (chunks.length !== chunkIds.length) throw new Error("knowledge_material_missing");
      const [blocks, evidence] = await Promise.all([
        db
          .select()
          .from(retrievalRepresentationBlocks)
          .where(
            or(
              ...chunks.map(({ chunk }) =>
                and(
                  eq(retrievalRepresentationBlocks.indexGenerationId, chunk.indexGenerationId),
                  eq(retrievalRepresentationBlocks.representationId, chunk.representationId),
                  gte(
                    retrievalRepresentationBlocks.ordinal,
                    Math.max(0, chunk.firstBlockOrdinal - 1),
                  ),
                  lte(retrievalRepresentationBlocks.ordinal, chunk.lastBlockOrdinal + 1),
                ),
              ),
            ),
          ),
        db
          .select()
          .from(retrievalEvidenceUnits)
          .where(
            or(
              ...chunks.map(({ chunk }) =>
                and(
                  eq(retrievalEvidenceUnits.indexGenerationId, chunk.indexGenerationId),
                  eq(retrievalEvidenceUnits.representationId, chunk.representationId),
                  gte(retrievalEvidenceUnits.blockOrdinal, chunk.firstBlockOrdinal),
                  lte(retrievalEvidenceUnits.blockOrdinal, chunk.lastBlockOrdinal),
                ),
              ),
            ),
          ),
      ]);
      const result = new Map();
      for (const {
        chunk: row,
        sourceName,
        artifactKind,
        originalFilename,
        workspaceId,
        workspaceName,
        sourceRevision,
        representationHash,
        representationAdapterId,
        representationAdapterVersion,
      } of chunks) {
        if (!representationHash) throw new Error("knowledge_representation_metadata_missing");
        const chunk = chunkFromRow(row);
        const materialBlocks: RepresentationBlock[] = blocks
          .filter(
            (block) =>
              block.indexGenerationId === row.indexGenerationId &&
              block.representationId === row.representationId,
          )
          .map((block) => {
            const locator = evidenceLocatorSchema.parse(block.locator);
            const content = evidenceContentSchema.parse(block.content);
            const fidelity = evidenceFidelitySchema.parse(block.fidelity);
            return {
              id: block.id,
              representationId: block.representationId,
              ordinal: block.ordinal,
              kind: blockKind(block.kind),
              headingPath: block.headingPath,
              exactText: block.exactText,
              indexText: block.indexText,
              locator,
              content,
              fidelity,
              contentHash: normalizeStoredKnowledgeContentHash({
                adapterId: representationAdapterId,
                adapterVersion: representationAdapterVersion,
                storedHash: block.contentHash,
                exactText: block.exactText,
                content,
                locator,
                fidelity,
              }),
              capacityUnits: block.capacityUnits,
            };
          });
        const materialEvidence: EvidenceUnit[] = evidence
          .filter(
            (unit) =>
              unit.indexGenerationId === row.indexGenerationId &&
              unit.representationId === row.representationId,
          )
          .map((unit) => {
            const locator = evidenceLocatorSchema.parse(unit.locator);
            const content = evidenceContentSchema.parse(unit.content);
            const fidelity = evidenceFidelitySchema.parse(unit.fidelity);
            return {
              id: unit.id,
              representationId: unit.representationId,
              ordinal: unit.ordinal,
              blockOrdinal: unit.blockOrdinal,
              exactExcerpt: unit.exactExcerpt,
              locator,
              content,
              fidelity,
              contentHash: normalizeStoredKnowledgeContentHash({
                adapterId: representationAdapterId,
                adapterVersion: representationAdapterVersion,
                storedHash: unit.contentHash,
                exactText: unit.exactExcerpt,
                content,
                locator,
                fidelity,
              }),
              capacityUnits: unit.capacityUnits,
            };
          });
        result.set(row.id, {
          sourceId: row.sourceId,
          sourceName,
          sourcePresentation: artifactKind
            ? {
                artifactKind: artifactSourceKindSchema.parse(artifactKind),
                kind: "artifact",
              }
            : sourcePresentationHintForFilename(originalFilename ?? sourceName),
          workspaceId,
          workspaceName,
          workspaceRelation: workspaceId === rootWorkspaceId ? "current" : "referenced",
          sourceRevision,
          representationHash,
          chunk,
          blocks: materialBlocks,
          evidence: materialEvidence,
        });
      }
      return result;
    },
  };
}
