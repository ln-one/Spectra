import { createHash } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fromBufferPromise } from "yauzl";
import { artifactRenderJobs } from "@/database/schema";
import type { ArtifactGroundingBundle } from "@/features/artifacts/grounding";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import type { TeachingDocumentDraft } from "./documents/contract";
import { finalizeTeachingDocumentDraft } from "./documents/finalize";
import {
  claimTeachingDocumentGeneration,
  completeTeachingDocumentGeneration,
  saveTeachingDocumentRevision,
  startTeachingDocumentGeneration,
  updateTeachingDocumentGeneration,
} from "./documents/service";
import { renderArtifactRevisionJob } from "./render-dbos-worker";
import {
  ensureTeachingDocumentRenderJob,
  getArtifactRenderDownload,
} from "./render-service.server";
import type { ArtifactRenderStorage } from "./render-storage.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.artifact_render_jobs, public.artifact_revisions, public.artifacts, public.workspaces, public.principals CASCADE",
  );
  actor = await ensurePrincipalForAuthUser("render-alice", "render-alice", testDatabase.db);
});

afterAll(async () => {
  await testDatabase.destroy();
});

function draft(title: string): TeachingDocumentDraft {
  return {
    blocks: [
      { kind: "heading", level: 1, text: "Overview" },
      { kind: "paragraph", text: "Body" },
      { kind: "bullet", text: "One" },
      { kind: "paragraph", text: "End" },
    ],
    title,
  };
}

async function readyArtifact(grounding?: ArtifactGroundingBundle) {
  const workspace = await createWorkspace(actor, { name: "Render" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: "00000000-0000-4000-8000-000000000401",
      ...(grounding ? { grounding } : {}),
      locale: "en-US",
      prompt: "Create render fixture",
      sourceUserMessageId: "user:render",
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const attemptId = started.generationAttemptId;
  if (!attemptId) throw new Error("Expected generation attempt");
  await claimTeachingDocumentGeneration(started.id, attemptId, testDatabase.db);
  await updateTeachingDocumentGeneration(
    started.id,
    attemptId,
    {
      draft: {
        format: "markdown",
        markdown: "# Revision one\n\n# Overview\n\nBody\n\n- One\n\nEnd",
      },
      state: "finalizing",
    },
    testDatabase.db,
  );
  const artifact = await completeTeachingDocumentGeneration(
    started.id,
    attemptId,
    actor.principalId,
    draft("Revision one"),
    finalizeTeachingDocumentDraft(draft("Revision one")),
    testDatabase.db,
  );
  return { artifact, workspace };
}

async function docxText(buffer: Buffer) {
  const zip = await fromBufferPromise(buffer);
  const chunks: string[] = [];
  try {
    for await (const entry of zip.eachEntry()) {
      if (!entry.fileName.endsWith(".xml") && !entry.fileName.endsWith(".rels")) continue;
      const stream = await zip.openReadStreamPromise(entry);
      for await (const chunk of stream) chunks.push(Buffer.from(chunk).toString("utf8"));
    }
  } finally {
    zip.close();
  }
  return chunks.join("\n");
}

describe("Artifact render jobs", () => {
  it("replays one job per fixed revision, format, and renderer", async () => {
    const { artifact } = await readyArtifact();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const input = { artifactId: artifact.id, revisionId: artifact.currentRevision.id };
    const first = await ensureTeachingDocumentRenderJob(actor, input, testDatabase.db, enqueue);
    const replay = await ensureTeachingDocumentRenderJob(actor, input, testDatabase.db, enqueue);
    expect(replay.id).toBe(first.id);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("keeps exports pinned when the Artifact head advances", async () => {
    const { artifact, workspace } = await readyArtifact();
    const firstJob = await ensureTeachingDocumentRenderJob(
      actor,
      { artifactId: artifact.id, revisionId: artifact.currentRevision.id },
      testDatabase.db,
      async () => undefined,
    );
    const updated = await saveTeachingDocumentRevision(
      actor,
      {
        artifactId: artifact.id,
        content: finalizeTeachingDocumentDraft(draft("Revision two")),
        conversationId: "00000000-0000-4000-8000-000000000401",
        expectedRevisionId: artifact.currentRevision.id,
        workspaceId: workspace.id,
      },
      testDatabase.db,
    );
    expect(firstJob.artifactRevisionId).toBe(artifact.currentRevision.id);
    expect(updated.currentRevision.id).not.toBe(firstJob.artifactRevisionId);
  });

  it("retries a terminal render with a fenced workflow attempt", async () => {
    const { artifact } = await readyArtifact();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const input = { artifactId: artifact.id, revisionId: artifact.currentRevision.id };
    const first = await ensureTeachingDocumentRenderJob(actor, input, testDatabase.db, enqueue);
    await testDatabase.db
      .update(artifactRenderJobs)
      .set({ failureCode: "artifact_render_failed", state: "failed" })
      .where(eq(artifactRenderJobs.id, first.id));

    const retried = await ensureTeachingDocumentRenderJob(actor, input, testDatabase.db, enqueue);

    expect(retried).toMatchObject({ attemptNumber: 2, id: first.id, state: "queued" });
    expect(enqueue).toHaveBeenLastCalledWith(expect.anything(), first.id, 2);
  });

  it("downloads only a completed versioned object", async () => {
    const { artifact } = await readyArtifact();
    const job = await ensureTeachingDocumentRenderJob(
      actor,
      { artifactId: artifact.id, revisionId: artifact.currentRevision.id },
      testDatabase.db,
      async () => undefined,
    );
    await testDatabase.db
      .update(artifactRenderJobs)
      .set({
        finishedAt: new Date(),
        outputMediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        outputObjectKey: `artifacts/${artifact.id}/renders/${job.id}.docx`,
        outputObjectVersionId: "version-1",
        outputSha256: "a".repeat(64),
        outputSizeBytes: 128,
        state: "ready",
      })
      .where(eq(artifactRenderJobs.id, job.id));
    const get = vi.fn().mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const storage: ArtifactRenderStorage = {
      delete: vi.fn(),
      get,
      listVersions: vi.fn().mockResolvedValue([]),
      put: vi.fn(),
    };
    const download = await getArtifactRenderDownload(
      actor,
      { artifactId: artifact.id, revisionId: artifact.currentRevision.id },
      { db: testDatabase.db, storage },
    );
    expect(download).toMatchObject({ filename: "Revision one.docx" });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ versionId: "version-1" }));
  });

  it("resumes a rendering job after a transient renderer attempt fails", async () => {
    const { artifact } = await readyArtifact();
    const job = await ensureTeachingDocumentRenderJob(
      actor,
      { artifactId: artifact.id, revisionId: artifact.currentRevision.id },
      testDatabase.db,
      async () => undefined,
    );
    const put = vi
      .fn<ArtifactRenderStorage["put"]>()
      .mockRejectedValueOnce(new Error("temporary object-store failure"))
      .mockResolvedValueOnce({ versionId: "version-recovered" });
    const storage: ArtifactRenderStorage = {
      delete: vi.fn(),
      get: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
      put,
    };
    await expect(
      renderArtifactRevisionJob({ db: testDatabase.db, storage }, job.id, job.attemptNumber),
    ).rejects.toThrow("temporary object-store failure");
    const [rendering] = await testDatabase.db
      .select()
      .from(artifactRenderJobs)
      .where(eq(artifactRenderJobs.id, job.id));
    expect(rendering?.state).toBe("rendering");

    await renderArtifactRevisionJob({ db: testDatabase.db, storage }, job.id, job.attemptNumber);
    const [ready] = await testDatabase.db
      .select()
      .from(artifactRenderJobs)
      .where(eq(artifactRenderJobs.id, job.id));
    expect(ready).toMatchObject({
      outputObjectVersionId: "version-recovered",
      state: "ready",
    });
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("replaces an unpublished version so stored metadata describes the published body", async () => {
    const { artifact } = await readyArtifact();
    const job = await ensureTeachingDocumentRenderJob(
      actor,
      { artifactId: artifact.id, revisionId: artifact.currentRevision.id },
      testDatabase.db,
      async () => undefined,
    );
    await testDatabase.db
      .update(artifactRenderJobs)
      .set({ startedAt: new Date(), state: "rendering" })
      .where(eq(artifactRenderJobs.id, job.id));
    const put = vi
      .fn<ArtifactRenderStorage["put"]>()
      .mockResolvedValue({ versionId: "version-recovered" });
    const deleteVersion = vi.fn<ArtifactRenderStorage["delete"]>();
    const storage: ArtifactRenderStorage = {
      delete: deleteVersion,
      get: vi.fn(),
      listVersions: vi.fn().mockResolvedValue(["version-from-crashed-process"]),
      put,
    };

    await renderArtifactRevisionJob({ db: testDatabase.db, storage }, job.id, job.attemptNumber);
    const [ready] = await testDatabase.db
      .select()
      .from(artifactRenderJobs)
      .where(eq(artifactRenderJobs.id, job.id));
    expect(ready).toMatchObject({
      outputObjectVersionId: "version-recovered",
      state: "ready",
    });
    expect(deleteVersion).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: "version-from-crashed-process" }),
    );
    expect(put).toHaveBeenCalledOnce();
    const renderedBody = put.mock.calls[0]?.[0].body;
    expect(renderedBody).toBeDefined();
    expect(ready?.outputSizeBytes).toBe(renderedBody?.byteLength);
    expect(ready?.outputSha256).toBe(
      createHash("sha256")
        .update(renderedBody ?? new Uint8Array())
        .digest("hex"),
    );
  });

  it("exports only revision content and never serializes the source receipt", async () => {
    const secretSourceName = "PRIVATE-SOURCE-RECEIPT-ONLY.pdf";
    const { artifact } = await readyArtifact({
      evidence: [
        {
          content: { kind: "exact_text", text: "Reference-only context." },
          contentHash: "a".repeat(64),
          evidenceId: "11111111-1111-4111-8111-111111111111",
          fidelity: "source",
          locator: { end: 23, kind: "text_range", start: 0 },
          representationHash: "b".repeat(64),
          sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          sourceName: secretSourceName,
          sourceRevision: 1,
        },
      ],
      version: 1,
    });
    expect(artifact.groundingSources).toEqual([
      {
        sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sourceName: secretSourceName,
      },
    ]);
    const job = await ensureTeachingDocumentRenderJob(
      actor,
      { artifactId: artifact.id, revisionId: artifact.currentRevision.id },
      testDatabase.db,
      async () => undefined,
    );
    const put = vi
      .fn<ArtifactRenderStorage["put"]>()
      .mockResolvedValue({ versionId: "receipt-free-version" });
    const storage: ArtifactRenderStorage = {
      delete: vi.fn(),
      get: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
      put,
    };

    await renderArtifactRevisionJob({ db: testDatabase.db, storage }, job.id, job.attemptNumber);

    const body = put.mock.calls[0]?.[0].body;
    if (!body) throw new Error("Expected rendered DOCX");
    await expect(docxText(Buffer.from(body))).resolves.not.toContain(secretSourceName);
  });
});
