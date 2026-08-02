import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { parsePptdProject } from "@deckelier/contracts";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import {
  artifactRenderJobs,
  artifactSourceBundles,
  presentationEditorSnapshots,
} from "@/database/schema";
import { publishArtifactSourceRevision } from "@/features/artifacts/artifact-source-publication.server";
import { ArtifactError } from "@/features/artifacts/errors";
import {
  type ArtifactGenerationStartInput,
  artifactGenerationStartInputSchema,
} from "@/features/artifacts/generation";
import { appendArtifactRevision } from "@/features/artifacts/lifecycle.server";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import { openHandsExecutionEnabled } from "@/features/artifacts/task-agent/config.server";
import { createTaskAgentGenerationLifecycle } from "@/features/artifacts/task-agent/generation-lifecycle.server";
import type { Actor } from "@/features/identity/types";
import type { TaskAgentGenerationQueue } from "../task-agent/generation-queue";
import {
  type PresentationRevisionContent,
  presentationGenerationDraftSchema,
  presentationGenerationRequestSchema,
  presentationRevisionContentSchema,
} from "./contract";
import {
  PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE,
  PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE,
  type PresentationEditorObject,
  type PresentationEditorSavedProject,
  parsePresentationEditorProject,
  parsePresentationEditorSource,
} from "./editor-project";
import { PresentationError } from "./errors";
import {
  extractPresentationPptdAssets,
  extractPresentationPptdSource,
  readPresentationSourceArchive,
} from "./pipeline.server";
import type { PresentationDetail } from "./types";

const idSchema = z.string().uuid();
const PRESENTATION_EDITOR_COVER_MAX_BYTES = 10 * 1024 * 1024;
const PRESENTATION_EDITOR_COVER_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const presentationStages = ["provisioning", "authoring", "publishing"] as const;
const PPTX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const PRESENTATION_SOURCE_CACHE_LIMIT = 8;
const presentationSourceFilesCache = new Map<
  string,
  Promise<Awaited<ReturnType<typeof readPresentationSourceArchive>>>
>();

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

function parsePresentationEditorCover(object: PresentationEditorObject | undefined) {
  if (!object) return undefined;
  if (
    !PRESENTATION_EDITOR_COVER_MEDIA_TYPES.includes(
      object.mediaType as (typeof PRESENTATION_EDITOR_COVER_MEDIA_TYPES)[number],
    ) ||
    object.body.byteLength < 1 ||
    object.body.byteLength > PRESENTATION_EDITOR_COVER_MAX_BYTES
  ) {
    throw new PresentationError("presentation_editor_project_invalid");
  }
  return object;
}

async function getPresentationEditorSnapshot(artifactId: string, revisionId: string, db: Database) {
  const [snapshot] = await db
    .select()
    .from(presentationEditorSnapshots)
    .where(
      and(
        eq(presentationEditorSnapshots.artifactId, idSchema.parse(artifactId)),
        eq(presentationEditorSnapshots.artifactRevisionId, idSchema.parse(revisionId)),
      ),
    )
    .limit(1);
  return snapshot ?? null;
}

function editorContentNodeText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const text = Reflect.get(value, "text");
  const content = Reflect.get(value, "content");
  return [
    typeof text === "string" ? text : "",
    ...(Array.isArray(content) ? content.map(editorContentNodeText) : []),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function editorSlideTitle(slide: PresentationEditorSavedProject["slides"][number], index: number) {
  const textElements = slide.elements.filter((element) => element.type === "text");
  const preferred =
    textElements.find((element) => ["$coverTitle", "$title"].includes(String(element.style))) ??
    textElements[0];
  const title = editorContentNodeText(preferred?.contentNode).slice(0, 300);
  return title || `Slide ${index + 1}`;
}

const presentationGenerationLifecycle = createTaskAgentGenerationLifecycle({
  contentSchema: presentationRevisionContentSchema,
  draftSchema: presentationGenerationDraftSchema,
  errorLabel: "Presentation",
  kind: "presentation",
  notFoundError: () => new PresentationError("presentation_not_found"),
  recipeVersion: "presentation-pptd-v1",
  requestSchema: presentationGenerationRequestSchema,
  stages: presentationStages,
  titleOf: (content) => content.title,
});

export async function requirePresentationEditorArtifactManage(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
) {
  const parsed = z
    .object({ artifactId: idSchema, conversationId: idSchema, workspaceId: idSchema })
    .strict()
    .safeParse({
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    });
  if (!parsed.success) {
    throw new PresentationError("presentation_editor_project_invalid", {
      cause: parsed.error,
    });
  }
  await presentationGenerationLifecycle.requirePrivateArtifactManage(actor, parsed.data, db);
}

export async function startPresentationGeneration(
  actor: Actor,
  input: ArtifactGenerationStartInput,
  queue: TaskAgentGenerationQueue,
  db: Database = database,
): Promise<PresentationDetail> {
  const parsed = artifactGenerationStartInputSchema.parse(input);
  await presentationGenerationLifecycle.requirePrivateArtifactCreate(actor, parsed.workspaceId, db);
  const request = presentationGenerationRequestSchema.parse({
    grounding: parsed.grounding,
    locale: parsed.locale,
    prompt: parsed.prompt,
    recipe: "presentation-pptd-v1",
  });
  const result = await presentationGenerationLifecycle.startGeneration(
    {
      actorId: actor.principalId,
      conversationId: parsed.conversationId,
      generationRequest: request,
      rootRunId: parsed.rootRunId ?? null,
      sourcePlanItemId: parsed.sourcePlanItemId ?? null,
      sourceUserMessageId: parsed.sourceUserMessageId,
      title:
        parsed.requestedTitle ??
        parsed.prompt.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 200),
      workspaceId: parsed.workspaceId,
    },
    queue,
    db,
  );
  return presentationGenerationLifecycle.toDetail(result.artifact, result.revision);
}

export async function getPresentationDetailForConversation(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
): Promise<PresentationDetail> {
  return presentationGenerationLifecycle.getDetailForConversation(actor, input, db);
}

export async function getPresentationGenerationInputById(
  artifactId: string,
  db: Database = database,
) {
  return presentationGenerationLifecycle.getGenerationInputById(artifactId, db);
}

export const claimPresentationGeneration = presentationGenerationLifecycle.claimGeneration;
export const updatePresentationStage = presentationGenerationLifecycle.updateStage;
export const failPresentationGeneration = presentationGenerationLifecycle.failGeneration;

export async function completePresentationGeneration(
  input: {
    actorId: string;
    artifactId: string;
    attemptId: string;
    content: PresentationRevisionContent;
  },
  db: Database = database,
) {
  const result = await presentationGenerationLifecycle.completeGeneration(
    {
      actorId: input.actorId,
      artifactId: input.artifactId,
      attemptId: input.attemptId,
      content: input.content,
      publishResources: async () => {},
    },
    db,
  );
  return presentationGenerationLifecycle.toArtifact(result.artifact, result.revision);
}

async function getPresentationReadyRender(
  artifactId: string,
  revisionId: string,
  db: Database = database,
) {
  const [render] = await db
    .select()
    .from(artifactRenderJobs)
    .where(
      and(
        eq(artifactRenderJobs.artifactId, idSchema.parse(artifactId)),
        eq(artifactRenderJobs.artifactRevisionId, idSchema.parse(revisionId)),
        eq(artifactRenderJobs.format, "pptx"),
        eq(artifactRenderJobs.state, "ready"),
      ),
    )
    .limit(1);
  return render ?? null;
}

async function getPresentationPublishedSource(
  artifactId: string,
  revisionId: string,
  db: Database = database,
) {
  const [source] = await db
    .select()
    .from(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.artifactId, idSchema.parse(artifactId)),
        eq(artifactSourceBundles.artifactRevisionId, idSchema.parse(revisionId)),
        eq(artifactSourceBundles.state, "published"),
      ),
    )
    .limit(1);
  return source ?? null;
}

export async function getPresentationPptxDownload(
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
  await presentationGenerationLifecycle.requirePrivateArtifactManage(actor, input, db);
  const detail = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.revisionId
  ) {
    return null;
  }
  const render = await getPresentationReadyRender(input.artifactId, input.revisionId, db);
  if (!render?.outputObjectKey || !render.outputObjectVersionId) return null;
  const storage = options.storage ?? createArtifactRenderStorage();
  const object = await storage.get({
    key: render.outputObjectKey,
    versionId: render.outputObjectVersionId,
  });
  if (
    object.contentType !== PPTX_MEDIA_TYPE ||
    object.body.byteLength !== render.outputSizeBytes ||
    createHash("sha256").update(object.body).digest("hex") !== render.outputSha256
  ) {
    throw new Error("presentation_pptx_object_conflict");
  }
  const safeTitle =
    detail.artifact.currentRevision.content.title
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "presentation";
  return {
    ...object,
    filename: `${safeTitle}.pptx`,
  };
}

async function getPresentationPptdSourceFiles(
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
  await presentationGenerationLifecycle.requirePrivateArtifactManage(actor, input, db);
  const detail = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.revisionId
  ) {
    return null;
  }
  const source = await getPresentationPublishedSource(input.artifactId, input.revisionId, db);
  if (!source?.objectKey || !source.objectVersionId) return null;
  const storage = options.storage ?? createArtifactRenderStorage();
  const cacheKey = `${source.objectKey}\0${source.objectVersionId}\0${source.sha256}`;
  let filesPromise = presentationSourceFilesCache.get(cacheKey);
  if (!filesPromise) {
    filesPromise = (async () => {
      const object = await storage.get({
        key: source.objectKey,
        versionId: source.objectVersionId,
      });
      if (
        object.body.byteLength !== source.sizeBytes ||
        createHash("sha256").update(object.body).digest("hex") !== source.sha256
      ) {
        throw new Error("presentation_source_object_conflict");
      }
      return readPresentationSourceArchive(object.body);
    })();
    presentationSourceFilesCache.set(cacheKey, filesPromise);
    while (presentationSourceFilesCache.size > PRESENTATION_SOURCE_CACHE_LIMIT) {
      const oldestKey = presentationSourceFilesCache.keys().next().value;
      if (oldestKey) presentationSourceFilesCache.delete(oldestKey);
    }
    filesPromise.catch(() => {
      if (presentationSourceFilesCache.get(cacheKey) === filesPromise) {
        presentationSourceFilesCache.delete(cacheKey);
      }
    });
  }
  return filesPromise;
}

export async function getPresentationPptdSource(
  actor: Actor,
  input: {
    artifactId: string;
    conversationId: string;
    revisionId: string;
    workspaceId: string;
  },
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const files = await getPresentationPptdSourceFiles(actor, input, options);
  return files ? extractPresentationPptdSource(files) : null;
}

export async function getPresentationPptdAssets(
  actor: Actor,
  input: {
    artifactId: string;
    conversationId: string;
    paths: string[];
    revisionId: string;
    workspaceId: string;
  },
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const files = await getPresentationPptdSourceFiles(actor, input, options);
  return files ? await extractPresentationPptdAssets(files, input.paths) : null;
}

export async function getPresentationEditorSource(
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
  await presentationGenerationLifecycle.requirePrivateArtifactManage(actor, input, db);
  const detail = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.revisionId
  ) {
    return null;
  }
  const snapshot = await getPresentationEditorSnapshot(input.artifactId, input.revisionId, db);
  if (snapshot) {
    return {
      kind: "saved-project" as const,
      title: detail.artifact.currentRevision.content.title,
    };
  }
  const source = await getPresentationPptdSource(actor, input, options);
  return source ? { ...source, kind: "pptd" as const } : null;
}

export async function getPresentationEditorProject(
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
  await requirePresentationEditorArtifactManage(actor, input, db);
  const detail = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.revisionId
  ) {
    return null;
  }
  const snapshot = await getPresentationEditorSnapshot(input.artifactId, input.revisionId, db);
  if (!snapshot) return null;
  const storage = options.storage ?? createArtifactRenderStorage();
  const object = await storage.get({
    key: snapshot.projectObjectKey,
    versionId: snapshot.projectObjectVersionId,
  });
  if (
    object.contentType !== snapshot.projectMediaType ||
    object.body.byteLength !== snapshot.projectSizeBytes ||
    sha256(object.body) !== snapshot.projectSha256
  ) {
    throw new Error("presentation_editor_project_object_conflict");
  }
  return object;
}

export async function getPresentationEditorPptdSource(
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
  await requirePresentationEditorArtifactManage(actor, input, db);
  const detail = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.revisionId
  ) {
    return null;
  }
  const snapshot = await getPresentationEditorSnapshot(input.artifactId, input.revisionId, db);
  if (
    !snapshot?.sourceObjectKey ||
    !snapshot.sourceObjectVersionId ||
    !snapshot.sourceMediaType ||
    snapshot.sourceSizeBytes === null ||
    !snapshot.sourceSha256
  ) {
    return null;
  }
  const storage = options.storage ?? createArtifactRenderStorage();
  const object = await storage.get({
    key: snapshot.sourceObjectKey,
    versionId: snapshot.sourceObjectVersionId,
  });
  if (
    object.contentType !== PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE ||
    object.body.byteLength !== snapshot.sourceSizeBytes ||
    sha256(object.body) !== snapshot.sourceSha256
  ) {
    throw new Error("presentation_editor_source_object_conflict");
  }
  try {
    return parsePresentationEditorSource(JSON.parse(new TextDecoder().decode(object.body)));
  } catch (error) {
    throw new Error("presentation_editor_source_invalid", { cause: error });
  }
}

export async function savePresentationEditorProject(
  actor: Actor,
  input: {
    artifactId: string;
    conversationId: string;
    cover?: PresentationEditorObject;
    expectedRevisionId: string;
    name: string;
    project: PresentationEditorObject;
    source?: unknown;
    workspaceId: string;
  },
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const db = options.db ?? database;
  const parsedIdentifiers = z
    .object({
      artifactId: idSchema,
      conversationId: idSchema,
      expectedRevisionId: idSchema,
      name: z.string().trim().min(1).max(200),
      workspaceId: idSchema,
    })
    .strict()
    .safeParse({
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      expectedRevisionId: input.expectedRevisionId,
      name: input.name,
      workspaceId: input.workspaceId,
    });
  if (!parsedIdentifiers.success) {
    throw new PresentationError("presentation_editor_project_invalid", {
      cause: parsedIdentifiers.error,
    });
  }
  const identifiers = parsedIdentifiers.data;
  const project = parsePresentationEditorProject(input.project);
  const source =
    input.source === undefined ? undefined : parsePresentationEditorSource(input.source);
  const cover = parsePresentationEditorCover(input.cover);
  if (project.title !== identifiers.name) {
    throw new PresentationError("presentation_editor_project_invalid");
  }
  if (source) {
    const sourceProject = parsePptdProject(source.pptdContent, source.pageMap);
    if (
      sourceProject.title !== project.title ||
      sourceProject.pages.length !== project.slides.length
    ) {
      throw new PresentationError("presentation_editor_project_invalid");
    }
  }
  await requirePresentationEditorArtifactManage(actor, identifiers, db);
  const detail = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: identifiers.artifactId,
      conversationId: identifiers.conversationId,
      workspaceId: identifiers.workspaceId,
    },
    db,
  );
  const projectSha256 = sha256(input.project.body);
  const sourceBody = source
    ? new TextEncoder().encode(
        JSON.stringify({ pageMap: source.pageMap, pptdContent: source.pptdContent }),
      )
    : undefined;
  const sourceSha256 = sourceBody ? sha256(sourceBody) : null;
  if (detail.generationState !== "ready") {
    throw new PresentationError("presentation_revision_conflict");
  }

  if (detail.artifact.currentRevision.id !== identifiers.expectedRevisionId) {
    const currentRevision = detail.artifact.currentRevision;
    const replaySnapshot =
      currentRevision.parentRevisionId === identifiers.expectedRevisionId
        ? await getPresentationEditorSnapshot(identifiers.artifactId, currentRevision.id, db)
        : null;
    const coverSha256 = cover ? sha256(cover.body) : null;
    if (
      replaySnapshot?.projectSha256 === projectSha256 &&
      replaySnapshot.sourceSha256 === sourceSha256 &&
      replaySnapshot.coverSha256 === coverSha256 &&
      currentRevision.content.title === identifiers.name
    ) {
      return detail;
    }
    throw new PresentationError("presentation_revision_conflict");
  }

  const currentSnapshot = await getPresentationEditorSnapshot(
    identifiers.artifactId,
    identifiers.expectedRevisionId,
    db,
  );
  if (
    currentSnapshot?.projectSha256 === projectSha256 &&
    currentSnapshot.sourceSha256 === sourceSha256
  ) {
    return detail;
  }

  const storage = options.storage ?? createArtifactRenderStorage();
  const snapshotId = randomUUID();
  const objectPrefix = `artifacts/${identifiers.artifactId}/presentation-editor/${identifiers.expectedRevisionId}`;
  const uploaded: Array<{ key: string; versionId: string }> = [];
  const cleanupUploads = async () => {
    const cleanup = await Promise.allSettled(uploaded.map((object) => storage.delete(object)));
    const failures = cleanup.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        "presentation_editor_upload_cleanup_failed",
      );
    }
  };
  let committed = false;

  try {
    const projectObjectKey = `${objectPrefix}/project.json`;
    const projectUpload = await storage.put({
      body: input.project.body,
      contentType: PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE,
      key: projectObjectKey,
    });
    uploaded.push({ key: projectObjectKey, versionId: projectUpload.versionId });

    let coverIdentity:
      | {
          coverMediaType: string;
          coverObjectKey: string;
          coverObjectVersionId: string;
          coverSha256: string;
          coverSizeBytes: number;
        }
      | undefined;
    if (cover) {
      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[cover.mediaType];
      if (!extension) throw new PresentationError("presentation_editor_project_invalid");
      const coverObjectKey = `${objectPrefix}/cover.${extension}`;
      const coverUpload = await storage.put({
        body: cover.body,
        contentType: cover.mediaType,
        key: coverObjectKey,
      });
      uploaded.push({ key: coverObjectKey, versionId: coverUpload.versionId });
      coverIdentity = {
        coverMediaType: cover.mediaType,
        coverObjectKey,
        coverObjectVersionId: coverUpload.versionId,
        coverSha256: sha256(cover.body),
        coverSizeBytes: cover.body.byteLength,
      };
    }

    let sourceIdentity:
      | {
          sourceMediaType: string;
          sourceObjectKey: string;
          sourceObjectVersionId: string;
          sourceSha256: string;
          sourceSizeBytes: number;
        }
      | undefined;
    if (source && sourceBody && sourceSha256) {
      const sourceObjectKey = `${objectPrefix}/source.json`;
      const sourceUpload = await storage.put({
        body: sourceBody,
        contentType: PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE,
        key: sourceObjectKey,
      });
      uploaded.push({ key: sourceObjectKey, versionId: sourceUpload.versionId });
      sourceIdentity = {
        sourceMediaType: PRESENTATION_EDITOR_SOURCE_MEDIA_TYPE,
        sourceObjectKey,
        sourceObjectVersionId: sourceUpload.versionId,
        sourceSha256,
        sourceSizeBytes: sourceBody.byteLength,
      };
    }

    const snapshotValues = {
      artifactId: identifiers.artifactId,
      ...coverIdentity,
      ...sourceIdentity,
      id: snapshotId,
      projectMediaType: PRESENTATION_EDITOR_PROJECT_MEDIA_TYPE,
      projectObjectKey,
      projectObjectVersionId: projectUpload.versionId,
      projectSha256,
      projectSizeBytes: input.project.body.byteLength,
    };
    const revisionContent = {
      ...detail.artifact.currentRevision.content,
      editorProjectSha256: projectSha256,
      ...(sourceSha256 ? { editorSourceSha256: sourceSha256 } : {}),
      hasPptxRender: false,
      pageCount: project.slides.length,
      pageTitles: project.slides.map(editorSlideTitle),
      title: identifiers.name,
    };
    if (!sourceSha256) delete revisionContent.editorSourceSha256;

    let result: Awaited<ReturnType<typeof appendArtifactRevision>>;
    try {
      result = await appendArtifactRevision({
        actorId: actor.principalId,
        artifactId: identifiers.artifactId,
        content: revisionContent,
        conversationId: identifiers.conversationId,
        db,
        expectedRevisionId: identifiers.expectedRevisionId,
        kind: "presentation",
        publishResources: async (tx, { artifact, revision }) => {
          await tx.insert(presentationEditorSnapshots).values({
            ...snapshotValues,
            artifactRevisionId: revision.id,
          });
          await publishArtifactSourceRevision(tx, { artifact, revision });
        },
        title: identifiers.name,
        workspaceId: identifiers.workspaceId,
      });
    } catch (error) {
      if (error instanceof ArtifactError) {
        throw new PresentationError(
          error.code === "artifact_revision_conflict"
            ? "presentation_revision_conflict"
            : "presentation_not_found",
          { cause: error },
        );
      }
      throw error;
    }
    committed = true;
    return presentationGenerationLifecycle.toDetail(result.artifact, result.revision);
  } catch (error) {
    if (!committed) await cleanupUploads();
    throw error;
  }
}

export async function deletePresentationForConversation(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
) {
  return presentationGenerationLifecycle.tombstone(actor, input, db);
}

export async function retryPresentationGeneration(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  queue: TaskAgentGenerationQueue,
  db: Database = database,
  runtimeAvailable = openHandsExecutionEnabled(),
) {
  await presentationGenerationLifecycle.requirePrivateArtifactManage(actor, input, db);
  const detail = await getPresentationDetailForConversation(actor, input, db);
  if (!runtimeAvailable) {
    throw new PresentationError("presentation_runtime_unavailable");
  }
  if (detail.generationState !== "failed") {
    throw new PresentationError("presentation_not_retryable");
  }
  const artifact = await presentationGenerationLifecycle.retryGeneration(detail.id, queue, db);
  return presentationGenerationLifecycle.toDetail(artifact, null);
}

export async function purgeDeletedPresentationContent(artifactId: string, db: Database = database) {
  await db
    .delete(presentationEditorSnapshots)
    .where(eq(presentationEditorSnapshots.artifactId, artifactId));
  await presentationGenerationLifecycle.purgeDeletedContent(artifactId, db);
}
