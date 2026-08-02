import "server-only";

import { createHash } from "node:crypto";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/database/client";
import { artifactRenderJobs, artifactRevisions, artifacts } from "@/database/schema";
import { workerLogger } from "@/observability/server";
import { teachingDocumentRevisionContentSchema } from "./documents/contract";
import { teachingDocumentToDocx } from "./documents/export";
import { ARTIFACT_RENDER_DBOS_WORKFLOW } from "./render-dbos";
import { type ArtifactRenderStorage, createArtifactRenderStorage } from "./render-storage.server";

const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function renderArtifactRevisionJob(
  input: { db: Database; storage: ArtifactRenderStorage },
  jobId: string,
  attemptNumber: number,
) {
  const claimed = await input.db.transaction(async (tx) => {
    const [row] = await tx
      .select({ job: artifactRenderJobs, revision: artifactRevisions })
      .from(artifactRenderJobs)
      .innerJoin(artifactRevisions, eq(artifactRenderJobs.artifactRevisionId, artifactRevisions.id))
      .innerJoin(artifacts, eq(artifactRenderJobs.artifactId, artifacts.id))
      .where(
        and(
          eq(artifactRenderJobs.id, jobId),
          eq(artifactRenderJobs.attemptNumber, attemptNumber),
          inArray(artifactRenderJobs.state, ["queued", "rendering"]),
          isNull(artifactRenderJobs.deletedAt),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) return null;
    await tx
      .update(artifactRenderJobs)
      .set({
        startedAt: row.job.startedAt ?? new Date(),
        state: "rendering",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifactRenderJobs.id, jobId),
          eq(artifactRenderJobs.attemptNumber, attemptNumber),
          inArray(artifactRenderJobs.state, ["queued", "rendering"]),
        ),
      );
    return row;
  });
  if (!claimed) return;
  const renderStartedAt = claimed.job.startedAt ?? new Date();
  workerLogger.info(
    {
      artifactId: claimed.job.artifactId,
      component: "artifact-render",
      event: "artifact.render.started",
      renderAttemptNumber: attemptNumber,
      renderJobId: jobId,
      workflowId: DBOS.workflowID,
    },
    "Artifact render started",
  );
  const content = teachingDocumentRevisionContentSchema.parse(claimed.revision.content);
  const body = new Uint8Array(await teachingDocumentToDocx(content));
  const key = `artifacts/${claimed.job.artifactId}/renders/${jobId}/${attemptNumber}.docx`;
  const sha256 = createHash("sha256").update(body).digest("hex");
  const existingVersions = await input.storage.listVersions({ key });
  // DOCX archives contain volatile package metadata. A render rebuilt after a
  // crash is not byte-identical, so it must never publish a previous object
  // version with the newly computed hash and size.
  for (const existingVersionId of existingVersions) {
    await input.storage.delete({ key, versionId: existingVersionId });
  }
  const versionId = (await input.storage.put({ body, contentType: DOCX_MEDIA_TYPE, key }))
    .versionId;
  const completed = await input.db.transaction(async (tx) => {
    const [publishable] = await tx
      .select({ id: artifactRenderJobs.id })
      .from(artifactRenderJobs)
      .innerJoin(artifacts, eq(artifactRenderJobs.artifactId, artifacts.id))
      .where(
        and(
          eq(artifactRenderJobs.id, jobId),
          eq(artifactRenderJobs.attemptNumber, attemptNumber),
          eq(artifactRenderJobs.state, "rendering"),
          isNull(artifactRenderJobs.deletedAt),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!publishable) return null;
    const [published] = await tx
      .update(artifactRenderJobs)
      .set({
        failureCode: null,
        finishedAt: new Date(),
        outputMediaType: DOCX_MEDIA_TYPE,
        outputObjectKey: key,
        outputObjectVersionId: versionId,
        outputSha256: sha256,
        outputSizeBytes: body.byteLength,
        state: "ready",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifactRenderJobs.id, jobId),
          eq(artifactRenderJobs.attemptNumber, attemptNumber),
          eq(artifactRenderJobs.state, "rendering"),
          isNull(artifactRenderJobs.deletedAt),
        ),
      )
      .returning({ id: artifactRenderJobs.id });
    return published ?? null;
  });
  if (!completed) {
    await input.storage.delete({ key, versionId });
    return;
  }
  workerLogger.info(
    {
      artifactId: claimed.job.artifactId,
      component: "artifact-render",
      durationMs: Math.max(0, Date.now() - renderStartedAt.getTime()),
      event: "artifact.render.completed",
      outputSizeBytes: body.byteLength,
      renderAttemptNumber: attemptNumber,
      renderJobId: jobId,
      workflowId: DBOS.workflowID,
    },
    "Artifact render completed",
  );
}

export function registerArtifactRenderDbosWorkflow(input: {
  db: Database;
  storage?: ArtifactRenderStorage;
}) {
  const storage = input.storage ?? createArtifactRenderStorage();
  const render = DBOS.registerStep(
    (jobId: string, attemptNumber: number) =>
      renderArtifactRevisionJob({ db: input.db, storage }, jobId, attemptNumber),
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: "renderArtifactRevisionOutput",
      retriesAllowed: true,
    },
  );

  async function renderArtifactRevision(jobId: string, attemptNumber: number) {
    const startedAt = Date.now();
    try {
      await render(jobId, attemptNumber);
    } catch (error) {
      await DBOS.runStep(
        () =>
          input.db
            .update(artifactRenderJobs)
            .set({
              failureCode: "artifact_render_failed",
              finishedAt: new Date(),
              state: "failed",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(artifactRenderJobs.id, jobId),
                eq(artifactRenderJobs.attemptNumber, attemptNumber),
                eq(artifactRenderJobs.state, "rendering"),
              ),
            ),
        { name: "failArtifactRevisionRender" },
      );
      workerLogger.error(
        {
          component: "artifact-render",
          durationMs: Date.now() - startedAt,
          error,
          event: "artifact.render.failed",
          failureCode: "artifact_render_failed",
          renderAttemptNumber: attemptNumber,
          renderJobId: jobId,
          workflowId: DBOS.workflowID,
        },
        "Artifact render failed",
      );
      throw error;
    }
  }
  DBOS.registerWorkflow(renderArtifactRevision, {
    inputSchema: z.tuple([z.string().uuid(), z.number().int().positive()]),
    maxRecoveryAttempts: 100,
    name: ARTIFACT_RENDER_DBOS_WORKFLOW,
    serialization: "portable",
  });
}
