import "server-only";

import { Buffer } from "node:buffer";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { type Entry, fromBuffer, type ZipFile } from "yauzl";
import { type Database, database } from "@/database/client";
import {
  fileSources,
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  sourceIngestions,
  sources,
} from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { createS3SourceStorage } from "@/features/sources/s3-storage";
import type { SourceStorage, VersionedObject } from "@/features/sources/storage";
import { evidenceContentSchema } from "./schemas";
import { createKnowledgeStore } from "./store.server";

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_MODEL_IMAGE_EDGE = 2048;

export type MaterializedKnowledgeVisual = {
  bytes: Uint8Array;
  mediaType: "image/webp";
};

type VisualAssetDependencies = { db: Database; storage: SourceStorage };

function defaultDependencies(): VisualAssetDependencies {
  return { db: database, storage: createS3SourceStorage() };
}

function openZip(bytes: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(Buffer.from(bytes), { autoClose: false, lazyEntries: true }, (error, archive) => {
      if (error || !archive) reject(error ?? new Error("knowledge_visual_archive_invalid"));
      else resolve(archive);
    });
  });
}

function safeArchivePath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("knowledge_visual_archive_path_invalid");
  }
  return normalized;
}

export async function readKnowledgeVisualArchiveEntry(bytes: Uint8Array, requestedPath: string) {
  const path = safeArchivePath(requestedPath);
  try {
    return await readArchiveEntry(bytes, path);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "knowledge_visual_archive_entry_invalid",
        "knowledge_visual_archive_entry_missing",
        "knowledge_visual_image_too_large",
      ].includes(error.message)
    ) {
      throw error;
    }
    throw new Error("knowledge_visual_archive_entry_invalid", { cause: error });
  }
}

async function readArchiveEntry(bytes: Uint8Array, path: string) {
  const archive = await openZip(bytes);
  return new Promise<Uint8Array>((resolve, reject) => {
    let matchedEntry: Entry | null = null;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      archive.close();
      reject(error);
    };
    archive.on("error", (error) => fail(error));
    archive.on("entry", (entry: Entry) => {
      const name = entry.fileName.replaceAll("\\", "/");
      if (name === path) {
        if (
          matchedEntry ||
          entry.uncompressedSize <= 0 ||
          entry.uncompressedSize > MAX_IMAGE_BYTES
        ) {
          fail(new Error("knowledge_visual_archive_entry_invalid"));
          return;
        }
        matchedEntry = entry;
      }
      archive.readEntry();
    });
    archive.on("end", () => {
      if (!matchedEntry) {
        fail(new Error("knowledge_visual_archive_entry_missing"));
        return;
      }
      archive.openReadStream(matchedEntry, (error, stream) => {
        if (error || !stream) {
          fail(error ?? new Error("knowledge_visual_archive_entry_unavailable"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > MAX_IMAGE_BYTES) {
            stream.destroy(new Error("knowledge_visual_image_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("error", (streamError) => fail(streamError));
        stream.on("end", () => {
          if (settled) return;
          settled = true;
          archive.close();
          resolve(new Uint8Array(Buffer.concat(chunks)));
        });
      });
    });
    archive.readEntry();
  });
}

export async function normalizeKnowledgeVisualImage(
  bytes: Uint8Array,
): Promise<MaterializedKnowledgeVisual> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("knowledge_visual_image_too_large");
  }
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")
    ) {
      throw new Error("knowledge_visual_image_invalid");
    }
    const output = await image
      .rotate()
      .resize({
        width: MAX_MODEL_IMAGE_EDGE,
        height: MAX_MODEL_IMAGE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
    return { bytes: new Uint8Array(output), mediaType: "image/webp" };
  } catch (error) {
    if (error instanceof Error && error.message === "knowledge_visual_image_invalid") throw error;
    throw new Error("knowledge_visual_image_invalid", { cause: error });
  }
}

async function loadVisualRow(evidenceId: string, dependencies: VisualAssetDependencies) {
  const rows = await dependencies.db
    .select({
      evidence: retrievalEvidenceUnits,
      generation: retrievalIndexGenerations,
      source: sources,
      file: fileSources,
      ingestion: sourceIngestions,
    })
    .from(retrievalEvidenceUnits)
    .innerJoin(
      retrievalIndexGenerations,
      eq(retrievalEvidenceUnits.indexGenerationId, retrievalIndexGenerations.id),
    )
    .innerJoin(sources, eq(retrievalEvidenceUnits.sourceId, sources.id))
    .leftJoin(fileSources, eq(sources.id, fileSources.sourceId))
    .leftJoin(
      sourceIngestions,
      eq(retrievalIndexGenerations.sourceIngestionId, sourceIngestions.id),
    )
    .where(
      and(
        eq(retrievalEvidenceUnits.id, evidenceId),
        eq(retrievalIndexGenerations.state, "ready"),
        isNull(sources.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("knowledge_visual_unavailable");
  const content = evidenceContentSchema.safeParse(row.evidence.content);
  if (!content.success || content.data.kind !== "visual_region") {
    throw new Error("knowledge_visual_evidence_invalid");
  }
  const asset = content.data.asset;
  if (!asset) throw new Error("knowledge_visual_asset_missing");
  return { ...row, asset };
}

async function readVersionedObject(
  storage: SourceStorage,
  reference: VersionedObject,
  sizeBytes: number,
) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_ARCHIVE_BYTES) {
    throw new Error("knowledge_visual_object_too_large");
  }
  return storage.readObjectRange(reference, { start: 0, end: sizeBytes - 1 });
}

async function materializeRow(
  row: Awaited<ReturnType<typeof loadVisualRow>>,
  dependencies: VisualAssetDependencies,
) {
  let raw: Uint8Array;
  if (row.asset.kind === "source_original") {
    if (row.file?.state !== "stored" || !row.file.storageKey || !row.file.storageVersionId) {
      throw new Error("knowledge_visual_source_unavailable");
    }
    raw = await readVersionedObject(
      dependencies.storage,
      { key: row.file.storageKey, versionId: row.file.storageVersionId },
      row.file.sizeBytes,
    );
  } else {
    if (
      row.ingestion?.state !== "ready" ||
      !row.ingestion.resultStorageKey ||
      !row.ingestion.resultStorageVersionId ||
      !row.ingestion.resultSizeBytes
    ) {
      throw new Error("knowledge_visual_archive_unavailable");
    }
    const archive = await readVersionedObject(
      dependencies.storage,
      { key: row.ingestion.resultStorageKey, versionId: row.ingestion.resultStorageVersionId },
      row.ingestion.resultSizeBytes,
    );
    raw = await readKnowledgeVisualArchiveEntry(archive, row.asset.path);
  }
  return normalizeKnowledgeVisualImage(raw);
}

export async function readAuthorizedKnowledgeVisualAsset(input: {
  actor: Actor;
  workspaceId: string;
  evidenceId: string;
  dependencies?: Partial<VisualAssetDependencies>;
}) {
  const dependencies = { ...defaultDependencies(), ...input.dependencies };
  const snapshot = await createKnowledgeStore(dependencies.db).authorizeAndSnapshot(
    input.actor,
    input.workspaceId,
  );
  const row = await loadVisualRow(input.evidenceId, dependencies);
  if (!snapshot.generationIds.includes(row.generation.id)) {
    throw new Error("knowledge_visual_unavailable");
  }
  return materializeRow(row, dependencies);
}
