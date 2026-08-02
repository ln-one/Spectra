import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import { artifactRevisions, artifactSourceBundles } from "@/database/schema";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import type { Actor } from "@/features/identity/types";
import type { TaskAgentArchiveFile } from "../task-agent/source-archive";
import { presentationSourceManifestSchema } from "./contract";
import { PresentationError } from "./errors";
import {
  deterministicPresentationSourceArchive,
  extractPresentationPptdSource,
  readPresentationSourceArchive,
} from "./pipeline.server";
import { getPresentationEditorPptdSource } from "./service";

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

function pagePath(entrypointPath: string, reference: string) {
  if (reference.startsWith("/") || reference.split(/[\\/]/).includes("..")) {
    throw new PresentationError("presentation_refinement_invalid");
  }
  const directory = path.posix.dirname(entrypointPath);
  const resolved = path.posix.normalize(path.posix.join(directory, reference));
  if (resolved === directory || (directory !== "." && !resolved.startsWith(`${directory}/`))) {
    throw new PresentationError("presentation_refinement_invalid");
  }
  return resolved;
}

type PresentationEditorPptdSource = {
  pageMap: Record<string, string>;
  pptdContent: string;
};

export function mergePresentationEditorSourceWithAncestor(input: {
  ancestorFiles: readonly TaskAgentArchiveFile[];
  entrypoint: string;
  snapshotSource: PresentationEditorPptdSource;
}) {
  const files = new Map<string, TaskAgentArchiveFile>(
    input.ancestorFiles.map((file) => [file.path, file]),
  );
  if (input.ancestorFiles.length > 0) {
    const ancestorSource = extractPresentationPptdSource(input.ancestorFiles);
    const currentPagePaths = new Set(
      Object.keys(input.snapshotSource.pageMap).map((reference) =>
        pagePath(input.entrypoint, reference),
      ),
    );
    for (const reference of Object.keys(ancestorSource.pageMap)) {
      const oldPagePath = pagePath(input.entrypoint, reference);
      if (!currentPagePaths.has(oldPagePath)) files.delete(oldPagePath);
    }

    // Editor snapshots do not carry a separate asset index. Keep only
    // ancestor images still referenced by the current project/page text so a
    // deleted image cannot leak into the candidate source bundle.
    const currentSourceText = [
      input.snapshotSource.pptdContent,
      ...Object.values(input.snapshotSource.pageMap),
    ].join("\n");
    for (const file of [...files.values()]) {
      if (
        /\.(?:gif|jpe?g|png|svg|webp)$/i.test(file.path) &&
        !currentSourceText.includes(file.path) &&
        !currentSourceText.includes(path.posix.basename(file.path))
      ) {
        files.delete(file.path);
      }
    }
  }
  const encoder = new TextEncoder();
  files.set(input.entrypoint, {
    body: encoder.encode(input.snapshotSource.pptdContent),
    path: input.entrypoint,
  });
  for (const reference of Object.keys(input.snapshotSource.pageMap)) {
    const filePath = pagePath(input.entrypoint, reference);
    const page = input.snapshotSource.pageMap[reference];
    if (page === undefined) throw new PresentationError("presentation_refinement_invalid");
    files.set(filePath, { body: encoder.encode(page), path: filePath });
  }
  return [...files.values()];
}

async function loadBundle(
  bundle: typeof artifactSourceBundles.$inferSelect,
  storage: ArtifactRenderStorage,
) {
  const manifest = presentationSourceManifestSchema.parse(bundle.manifest);
  const object = await storage.get({ key: bundle.objectKey, versionId: bundle.objectVersionId });
  if (
    object.body.byteLength !== bundle.sizeBytes ||
    sha256(object.body) !== bundle.sha256 ||
    object.contentType !== bundle.mediaType
  ) {
    throw new Error("presentation_source_object_conflict");
  }
  const files = await readPresentationSourceArchive(object.body);
  const manifestPaths = new Map(manifest.files.map((file) => [file.path, file]));
  for (const file of files) {
    const declared = manifestPaths.get(file.path);
    if (
      !declared ||
      declared.sizeBytes !== file.body.byteLength ||
      declared.sha256 !== sha256(file.body)
    ) {
      throw new Error("presentation_source_manifest_conflict");
    }
  }
  if (files.length !== manifest.files.length)
    throw new Error("presentation_source_manifest_conflict");
  return { archive: object.body, files, manifest };
}

async function findPublishedBundle(artifactId: string, revisionId: string, db: Database) {
  const [bundle] = await db
    .select()
    .from(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.artifactId, artifactId),
        eq(artifactSourceBundles.artifactRevisionId, revisionId),
        eq(artifactSourceBundles.state, "published"),
      ),
    )
    .limit(1);
  return bundle ?? null;
}

async function findAncestorBundle(artifactId: string, revisionId: string, db: Database) {
  let currentRevisionId: string | null = revisionId;
  const visited = new Set<string>();
  while (currentRevisionId && !visited.has(currentRevisionId)) {
    visited.add(currentRevisionId);
    const [revision] = await db
      .select({ id: artifactRevisions.id, parentRevisionId: artifactRevisions.parentRevisionId })
      .from(artifactRevisions)
      .where(
        and(
          eq(artifactRevisions.artifactId, artifactId),
          eq(artifactRevisions.id, currentRevisionId),
        ),
      )
      .limit(1);
    if (!revision) break;
    const bundle = await findPublishedBundle(artifactId, revision.id, db);
    if (bundle) return bundle;
    currentRevisionId = revision.parentRevisionId;
  }
  return null;
}

export async function resolvePresentationSourceForRefinement(
  actor: Actor,
  input: {
    artifactId: string;
    conversationId: string;
    revisionId: string;
    workspaceId: string;
  },
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const db = options.db ?? database;
  const storage = options.storage ?? createArtifactRenderStorage();
  const directBundle = await findPublishedBundle(input.artifactId, input.revisionId, db);
  if (directBundle) {
    return {
      ...(await loadBundle(directBundle, storage)),
      revisionId: input.revisionId,
      source: "published" as const,
    };
  }

  const snapshotSource = await getPresentationEditorPptdSource(actor, input, { db, storage });
  const ancestorBundle = await findAncestorBundle(input.artifactId, input.revisionId, db);
  const ancestor = ancestorBundle ? await loadBundle(ancestorBundle, storage) : null;
  if (!snapshotSource && !ancestor) {
    throw new PresentationError("presentation_source_unavailable");
  }
  if (!snapshotSource) {
    // An ancestor is only an asset fallback. Without a snapshot for the
    // requested revision we cannot prove that its project/page list is still
    // current, so fail closed instead of silently editing old source.
    throw new PresentationError("presentation_source_unavailable");
  }

  const entrypoint = ancestor?.manifest.entrypoint ?? "out/presentation.pptd";
  const normalizedFiles = mergePresentationEditorSourceWithAncestor({
    ancestorFiles: ancestor?.files ?? [],
    entrypoint,
    snapshotSource,
  });
  const archive = await deterministicPresentationSourceArchive(normalizedFiles);
  const manifest = presentationSourceManifestSchema.parse({
    entrypoint,
    files: normalizedFiles.map((file) => ({
      path: file.path,
      sha256: sha256(file.body),
      sizeBytes: file.body.byteLength,
    })),
    schemaVersion: 1,
  });
  return {
    archive,
    files: normalizedFiles,
    manifest,
    revisionId: input.revisionId,
    source: ancestor ? ("editor_snapshot_with_ancestor" as const) : ("editor_snapshot" as const),
  };
}
