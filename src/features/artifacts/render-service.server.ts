import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { artifactRenderJobs, artifacts } from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { docxFilename } from "./documents/export";
import { getTeachingDocumentRevision } from "./documents/service";
import { enqueueArtifactRender } from "./render-dbos";
import { type ArtifactRenderStorage, createArtifactRenderStorage } from "./render-storage.server";

export const artifactRenderJobSchema = z
  .object({
    artifactId: z.string().uuid(),
    artifactRevisionId: z.string().uuid(),
    attemptNumber: z.number().int().positive(),
    failureCode: z.string().nullable(),
    format: z.literal("docx"),
    id: z.string().uuid(),
    state: z.enum(["queued", "rendering", "ready", "failed", "cancelled"]),
  })
  .strict();

const ARTIFACT_DOCX_RENDERER_VERSION = "teaching-document-docx-v3";

async function findTeachingDocumentRenderJob(
  input: { artifactId: string; revisionId: string },
  db: Database,
) {
  const [job] = await db
    .select()
    .from(artifactRenderJobs)
    .innerJoin(artifacts, eq(artifactRenderJobs.artifactId, artifacts.id))
    .where(
      and(
        eq(artifactRenderJobs.artifactId, input.artifactId),
        eq(artifactRenderJobs.artifactRevisionId, input.revisionId),
        eq(artifactRenderJobs.format, "docx"),
        eq(artifactRenderJobs.rendererVersion, ARTIFACT_DOCX_RENDERER_VERSION),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  return job?.artifact_render_jobs ?? null;
}

export async function ensureTeachingDocumentRenderJob(
  actor: Actor,
  input: { artifactId: string; revisionId: string },
  db: Database = database,
  enqueue: typeof enqueueArtifactRender = enqueueArtifactRender,
) {
  await getTeachingDocumentRevision(actor, input.artifactId, input.revisionId, db);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(artifactRenderJobs)
      .where(
        and(
          eq(artifactRenderJobs.artifactRevisionId, input.revisionId),
          eq(artifactRenderJobs.format, "docx"),
          eq(artifactRenderJobs.rendererVersion, ARTIFACT_DOCX_RENDERER_VERSION),
        ),
      )
      .limit(1)
      .for("update");
    if (existing) {
      if (existing.state !== "failed" && existing.state !== "cancelled") return existing;
      const nextAttempt = existing.attemptNumber + 1;
      const [retried] = await tx
        .update(artifactRenderJobs)
        .set({
          attemptNumber: nextAttempt,
          failureCode: null,
          finishedAt: null,
          outputMediaType: null,
          outputObjectKey: null,
          outputObjectVersionId: null,
          outputSha256: null,
          outputSizeBytes: null,
          startedAt: null,
          state: "queued",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(artifactRenderJobs.id, existing.id),
            eq(artifactRenderJobs.attemptNumber, existing.attemptNumber),
          ),
        )
        .returning();
      if (!retried) throw new Error("Artifact render retry conflicted");
      await enqueue(tx, retried.id, retried.attemptNumber);
      return retried;
    }
    const [job] = await tx
      .insert(artifactRenderJobs)
      .values({
        artifactId: input.artifactId,
        artifactRevisionId: input.revisionId,
        format: "docx",
        rendererVersion: ARTIFACT_DOCX_RENDERER_VERSION,
      })
      .onConflictDoNothing()
      .returning();
    if (!job) {
      const [replayed] = await tx
        .select()
        .from(artifactRenderJobs)
        .where(
          and(
            eq(artifactRenderJobs.artifactRevisionId, input.revisionId),
            eq(artifactRenderJobs.format, "docx"),
            eq(artifactRenderJobs.rendererVersion, ARTIFACT_DOCX_RENDERER_VERSION),
          ),
        )
        .limit(1);
      if (!replayed) throw new Error("Artifact render job was not created");
      return replayed;
    }
    await enqueue(tx, job.id, job.attemptNumber);
    return job;
  });
}

export async function getTeachingDocumentRenderJob(
  actor: Actor,
  input: { artifactId: string; revisionId: string },
  db: Database = database,
) {
  await getTeachingDocumentRevision(actor, input.artifactId, input.revisionId, db);
  return findTeachingDocumentRenderJob(input, db);
}

export async function getArtifactRenderDownload(
  actor: Actor,
  input: { artifactId: string; revisionId: string },
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const db = options.db ?? database;
  const revision = await getTeachingDocumentRevision(actor, input.artifactId, input.revisionId, db);
  const render = await findTeachingDocumentRenderJob(input, db);
  if (render?.state !== "ready" || !render.outputObjectKey || !render.outputObjectVersionId) {
    return null;
  }
  const storage = options.storage ?? createArtifactRenderStorage();
  const object = await storage.get({
    key: render.outputObjectKey,
    versionId: render.outputObjectVersionId,
  });
  return {
    ...object,
    filename: docxFilename(revision.content.title),
    job: render,
  };
}
