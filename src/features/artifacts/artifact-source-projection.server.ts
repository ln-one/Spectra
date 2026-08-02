import "server-only";

import { createHash } from "node:crypto";
import { parsePptdProject } from "@deckelier/contracts";
import { and, eq } from "drizzle-orm";
import { type Database, database } from "@/database/client";
import {
  type artifactRevisions,
  artifactSourceBundles,
  type artifacts,
  presentationEditorSnapshots,
} from "@/database/schema";
import type { ProjectableBlock } from "@/features/knowledge/projection";
import { artifactSourceProjectableBlocks } from "./artifact-source-projection";
import {
  presentationRevisionContentSchema,
  presentationSourceManifestSchema,
} from "./presentations/contract";
import {
  PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE,
  PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE,
  parsePresentationEditorProject,
  parsePresentationEditorSource,
} from "./presentations/editor-project";
import {
  extractPresentationPptdSource,
  readPresentationSourceArchive,
} from "./presentations/pipeline.server";
import {
  presentationPptdProjectableBlocks,
  presentationProjectableBlocks,
} from "./presentations/source-projection";
import { type ArtifactRenderStorage, createArtifactRenderStorage } from "./render-storage.server";
import { artifactSourceKindSchema } from "./types";

type ArtifactRow = typeof artifacts.$inferSelect;
type ArtifactRevisionRow = typeof artifactRevisions.$inferSelect;

export type ArtifactSourceProjection = {
  blocks: ProjectableBlock[];
  representationAdapterId: string;
  representationAdapterVersion: string;
  representationHash: string;
  representationMetadata: Record<string, unknown>;
};

type ArtifactSourceProjectionDependencies = {
  db?: Database;
  storage?: ArtifactRenderStorage;
};

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

function assertStoredObject(
  object: { body: Uint8Array; contentType: string },
  identity: {
    mediaType: string;
    sha256: string;
    sizeBytes: number;
  },
  failureCode: string,
) {
  if (
    object.contentType !== identity.mediaType ||
    object.body.byteLength !== identity.sizeBytes ||
    sha256(object.body) !== identity.sha256
  ) {
    throw new Error(failureCode);
  }
}

async function loadEditorProjection(
  artifact: ArtifactRow,
  revision: ArtifactRevisionRow,
  expectedProjectSha256: string,
  db: Database,
  storage: ArtifactRenderStorage,
): Promise<ArtifactSourceProjection> {
  const [snapshot] = await db
    .select()
    .from(presentationEditorSnapshots)
    .where(
      and(
        eq(presentationEditorSnapshots.artifactId, artifact.id),
        eq(presentationEditorSnapshots.artifactRevisionId, revision.id),
      ),
    )
    .limit(1);
  if (!snapshot || snapshot.projectSha256 !== expectedProjectSha256) {
    throw new Error("presentation_editor_snapshot_missing");
  }
  const object = await storage.get({
    key: snapshot.projectObjectKey,
    versionId: snapshot.projectObjectVersionId,
  });
  assertStoredObject(
    object,
    {
      mediaType: PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE,
      sha256: snapshot.projectSha256,
      sizeBytes: snapshot.projectSizeBytes,
    },
    "presentation_editor_project_object_conflict",
  );
  const project = parsePresentationEditorProject({
    body: object.body,
    mediaType: object.contentType,
  });
  return {
    blocks: presentationProjectableBlocks(project),
    representationAdapterId: "artifact/presentation",
    representationAdapterVersion: "1",
    representationHash: snapshot.projectSha256,
    representationMetadata: {
      artifactKind: "presentation",
      input: "editor_json",
    },
  };
}

async function loadSourceProjection(
  artifact: ArtifactRow,
  revision: ArtifactRevisionRow,
  db: Database,
  storage: ArtifactRenderStorage,
): Promise<ArtifactSourceProjection> {
  const [bundle] = await db
    .select()
    .from(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.artifactId, artifact.id),
        eq(artifactSourceBundles.artifactRevisionId, revision.id),
        eq(artifactSourceBundles.state, "published"),
      ),
    )
    .limit(1);
  if (
    bundle?.bundleFormat !== "tar_gzip" ||
    bundle.recipeVersion !== "presentation-pptd-v1" ||
    bundle.mediaType !== "application/gzip"
  ) {
    throw new Error("presentation_source_bundle_missing");
  }
  const manifest = presentationSourceManifestSchema.parse(bundle.manifest);
  const object = await storage.get({
    key: bundle.objectKey,
    versionId: bundle.objectVersionId,
  });
  assertStoredObject(
    object,
    {
      mediaType: bundle.mediaType,
      sha256: bundle.sha256,
      sizeBytes: bundle.sizeBytes,
    },
    "presentation_source_object_conflict",
  );
  const files = await readPresentationSourceArchive(object.body);
  const archivedFiles = new Map(
    files.map((file) => [
      file.path.startsWith("out/") ? file.path : `out/${file.path}`,
      { sha256: sha256(file.body), sizeBytes: file.body.byteLength },
    ]),
  );
  if (
    archivedFiles.size !== manifest.files.length ||
    manifest.files.some((file) => {
      const archived = archivedFiles.get(file.path);
      return !archived || archived.sha256 !== file.sha256 || archived.sizeBytes !== file.sizeBytes;
    })
  ) {
    throw new Error("presentation_source_manifest_conflict");
  }
  const source = extractPresentationPptdSource(files);
  const project = parsePptdProject(source.pptdContent, source.pageMap);
  return {
    blocks: presentationPptdProjectableBlocks({ slides: project.pages, title: project.title }),
    representationAdapterId: "artifact/presentation",
    representationAdapterVersion: "1",
    representationHash: bundle.sha256,
    representationMetadata: {
      artifactKind: "presentation",
      input: "pptd_source",
    },
  };
}

async function loadEditorPptdProjection(
  artifact: ArtifactRow,
  revision: ArtifactRevisionRow,
  expectedSourceSha256: string,
  db: Database,
  storage: ArtifactRenderStorage,
): Promise<ArtifactSourceProjection> {
  const [snapshot] = await db
    .select()
    .from(presentationEditorSnapshots)
    .where(
      and(
        eq(presentationEditorSnapshots.artifactId, artifact.id),
        eq(presentationEditorSnapshots.artifactRevisionId, revision.id),
      ),
    )
    .limit(1);
  if (
    !snapshot ||
    snapshot.sourceSha256 !== expectedSourceSha256 ||
    !snapshot.sourceObjectKey ||
    !snapshot.sourceObjectVersionId ||
    !snapshot.sourceMediaType ||
    snapshot.sourceSizeBytes === null
  ) {
    throw new Error("presentation_editor_source_snapshot_missing");
  }
  const object = await storage.get({
    key: snapshot.sourceObjectKey,
    versionId: snapshot.sourceObjectVersionId,
  });
  assertStoredObject(
    object,
    {
      mediaType: PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE,
      sha256: snapshot.sourceSha256,
      sizeBytes: snapshot.sourceSizeBytes,
    },
    "presentation_editor_source_object_conflict",
  );
  let source: unknown;
  try {
    source = JSON.parse(new TextDecoder().decode(object.body));
  } catch (error) {
    throw new Error("presentation_editor_source_invalid", { cause: error });
  }
  const parsedSource = parsePresentationEditorSource(source);
  const project = parsePptdProject(parsedSource.pptdContent, parsedSource.pageMap);
  return {
    blocks: presentationPptdProjectableBlocks({ slides: project.pages, title: project.title }),
    representationAdapterId: "artifact/presentation",
    representationAdapterVersion: "1",
    representationHash: snapshot.sourceSha256,
    representationMetadata: {
      artifactKind: "presentation",
      input: "editor_pptd_source",
    },
  };
}

export async function loadArtifactSourceProjection(
  input: {
    artifact: ArtifactRow;
    revision: ArtifactRevisionRow;
  },
  dependencies: ArtifactSourceProjectionDependencies = {},
): Promise<ArtifactSourceProjection> {
  const kind = artifactSourceKindSchema.parse(input.artifact.kind);
  if (input.revision.artifactId !== input.artifact.id) {
    throw new Error("artifact_source_revision_invalid");
  }
  if (kind !== "presentation") {
    return {
      blocks: artifactSourceProjectableBlocks(kind, input.revision.content),
      representationAdapterId: `artifact/${kind}`,
      representationAdapterVersion: "1",
      representationHash: input.revision.contentSha256,
      representationMetadata: { artifactKind: kind },
    };
  }
  const content = presentationRevisionContentSchema.parse(input.revision.content);
  const db = dependencies.db ?? database;
  const storage = dependencies.storage ?? createArtifactRenderStorage();
  if (content.editorSourceSha256) {
    return loadEditorPptdProjection(
      input.artifact,
      input.revision,
      content.editorSourceSha256,
      db,
      storage,
    );
  }
  return content.editorProjectSha256
    ? loadEditorProjection(input.artifact, input.revision, content.editorProjectSha256, db, storage)
    : loadSourceProjection(input.artifact, input.revision, db, storage);
}
