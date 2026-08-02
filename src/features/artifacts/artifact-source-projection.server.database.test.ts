import { createHash } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { canonicalJsonSha256 } from "@/database/canonical-json";
import {
  artifactGenerationAttempts,
  artifactRevisions,
  artifactSourceBundles,
  artifacts,
  presentationEditorSnapshots,
  principals,
  workspaces,
} from "@/database/schema";
import { loadArtifactSourceProjection } from "./artifact-source-projection.server";
import {
  deterministicPresentationSourceArchive,
  runPresentationPipeline,
} from "./presentations/pipeline.server";
import type { ArtifactRenderStorage } from "./render-storage.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

const encode = (value: string) => new TextEncoder().encode(value);
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

function storageReturning(
  objects: ReadonlyMap<string, { body: Uint8Array; contentType: string }>,
): ArtifactRenderStorage {
  const unsupported = async () => {
    throw new Error("unsupported test storage operation");
  };
  return {
    delete: unsupported,
    get: async ({ key, versionId }) => {
      const object = objects.get(`${key}\0${versionId}`);
      if (!object) throw new Error("test object missing");
      return object;
    },
    listVersions: unsupported,
    put: unsupported,
  };
}

async function artifactOwner() {
  const [principal] = await testDatabase.db
    .insert(principals)
    .values({ authUserId: crypto.randomUUID(), handle: `u-${crypto.randomUUID()}` })
    .returning();
  if (!principal) throw new Error("principal fixture failed");
  const [workspace] = await testDatabase.db
    .insert(workspaces)
    .values({ name: "Presentation projection", ownerId: principal.id })
    .returning();
  if (!workspace) throw new Error("workspace fixture failed");
  return { principal, workspace };
}

async function initialPresentationFixture() {
  const owner = await artifactOwner();
  const pipeline = await runPresentationPipeline({
    archive: await deterministicPresentationSourceArchive([
      {
        body: encode(`
title: Fixture deck
size: [1280, 720]
theme:
  colors: { primary: "#4F46E5" }
  textStyles:
    title: { fontSize: 52, color: "$primary" }
pages: [pages/cover.page]
`),
        path: "deck/deck.pptd",
      },
      {
        body: encode(`
pageType: cover
notes: Speaker note
elements:
  - elementId: title
    elementType: text
    bounds: [80, 80, 800, 100]
    content: { style: "$title", text: "Quarterly report" }
  - elementId: body
    elementType: text
    bounds: [80, 220, 900, 120]
    content: { text: "Revenue increased" }
`),
        path: "deck/pages/cover.page",
      },
    ]),
    summary: "Fixture",
  });
  const [artifact] = await testDatabase.db
    .insert(artifacts)
    .values({
      conversationId: crypto.randomUUID(),
      createdByPrincipalId: owner.principal.id,
      generationState: "ready",
      kind: "presentation",
      title: pipeline.content.title,
      workspaceId: owner.workspace.id,
    })
    .returning();
  if (!artifact) throw new Error("artifact fixture failed");
  const now = new Date();
  const [attempt] = await testDatabase.db
    .insert(artifactGenerationAttempts)
    .values({
      artifactId: artifact.id,
      executorKind: "task_agent",
      finishedAt: now,
      ordinal: 1,
      phase: "succeeded",
      startedAt: now,
      state: "submitted",
    })
    .returning();
  if (!attempt) throw new Error("attempt fixture failed");
  const [revision] = await testDatabase.db
    .insert(artifactRevisions)
    .values({
      artifactId: artifact.id,
      content: pipeline.content,
      contentSha256: canonicalJsonSha256(pipeline.content),
      createdByPrincipalId: owner.principal.id,
      generationAttemptId: attempt.id,
      revisionNumber: 1,
    })
    .returning();
  if (!revision) throw new Error("revision fixture failed");
  await testDatabase.db
    .update(artifacts)
    .set({ currentRevisionId: revision.id })
    .where(eq(artifacts.id, artifact.id));
  await testDatabase.db.insert(artifactSourceBundles).values({
    artifactId: artifact.id,
    artifactRevisionId: revision.id,
    bundleFormat: "tar_gzip",
    generationAttemptId: attempt.id,
    manifest: pipeline.sourceManifest,
    mediaType: "application/gzip",
    objectKey: `artifacts/${artifact.id}/source.tar.gz`,
    objectVersionId: "source-v1",
    recipeVersion: "presentation-pptd-v1",
    sha256: pipeline.sourceArchiveSha256,
    sizeBytes: pipeline.sourceArchive.byteLength,
    state: "published",
  });
  return {
    artifact,
    object: {
      body: pipeline.sourceArchive,
      contentType: "application/gzip",
    },
    revision,
  };
}

async function editorPresentationFixture(withSource = false) {
  const owner = await artifactOwner();
  const project = {
    height: 720,
    slides: [
      {
        elements: [
          {
            contentNode: {
              content: [
                {
                  content: [{ text: "Quarterly report", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "doc",
            },
            height: 100,
            id: "title",
            left: 80,
            rotate: 0,
            style: "$title",
            top: 80,
            type: "text",
            width: 800,
          },
          {
            contentNode: {
              content: [
                {
                  content: [{ text: "Revenue increased", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "doc",
            },
            height: 120,
            id: "body",
            left: 80,
            rotate: 0,
            top: 220,
            type: "text",
            width: 900,
          },
        ],
        height: 720,
        id: "slide-1",
        remark: "Speaker note",
        width: 1280,
      },
    ],
    title: "Fixture deck",
    type: "pptd",
    width: 1280,
  };
  const body = encode(JSON.stringify(project));
  const projectSha256 = sha256(body);
  const source = {
    pageMap: {
      "pages/cover.page": `pageType: cover\nnotes: Speaker note\nelements:\n  - elementId: title\n    elementType: text\n    bounds: [80, 80, 800, 100]\n    content: { style: "$title", text: "Quarterly report" }\n  - elementId: body\n    elementType: text\n    bounds: [80, 220, 900, 120]\n    content: { text: "Revenue increased" }\n`,
    },
    pptdContent: "title: Fixture deck\nsize: [1280, 720]\npages: [pages/cover.page]\n",
  };
  const sourceBody = encode(JSON.stringify(source));
  const sourceSha256 = sha256(sourceBody);
  const content = {
    ...(withSource ? { editorSourceSha256: sourceSha256 } : { editorProjectSha256: projectSha256 }),
    hasPptxRender: false,
    pageCount: 1,
    pageTitles: ["Quarterly report"],
    schemaVersion: 1,
    summary: "Fixture",
    title: "Fixture deck",
  };
  const [artifact] = await testDatabase.db
    .insert(artifacts)
    .values({
      conversationId: crypto.randomUUID(),
      createdByPrincipalId: owner.principal.id,
      generationState: "ready",
      kind: "presentation",
      title: content.title,
      workspaceId: owner.workspace.id,
    })
    .returning();
  if (!artifact) throw new Error("editor artifact fixture failed");
  const [revision] = await testDatabase.db
    .insert(artifactRevisions)
    .values({
      artifactId: artifact.id,
      content,
      contentSha256: canonicalJsonSha256(content),
      createdByPrincipalId: owner.principal.id,
      revisionNumber: 1,
    })
    .returning();
  if (!revision) throw new Error("editor revision fixture failed");
  await testDatabase.db
    .update(artifacts)
    .set({ currentRevisionId: revision.id })
    .where(eq(artifacts.id, artifact.id));
  await testDatabase.db.insert(presentationEditorSnapshots).values({
    artifactId: artifact.id,
    artifactRevisionId: revision.id,
    ...(withSource
      ? {
          sourceMediaType: "application/vnd.spectra.presentation-source+json",
          sourceObjectKey: `artifacts/${artifact.id}/source.json`,
          sourceObjectVersionId: "source-v1",
          sourceSha256,
          sourceSizeBytes: sourceBody.byteLength,
        }
      : {}),
    projectMediaType: "application/json",
    projectObjectKey: `artifacts/${artifact.id}/project.json`,
    projectObjectVersionId: "project-v1",
    projectSha256,
    projectSizeBytes: body.byteLength,
  });
  return {
    artifact,
    object: { body, contentType: "application/json" },
    revision,
    sourceObject: {
      body: sourceBody,
      contentType: "application/vnd.spectra.presentation-source+json",
    },
  };
}

describe("loadArtifactSourceProjection", () => {
  it("loads equivalent initial PPTD and edited project JSON through one semantic projector", async () => {
    const initial = await initialPresentationFixture();
    const edited = await editorPresentationFixture();
    const initialProjection = await loadArtifactSourceProjection(
      { artifact: initial.artifact, revision: initial.revision },
      {
        db: testDatabase.db,
        storage: storageReturning(
          new Map([[`artifacts/${initial.artifact.id}/source.tar.gz\0source-v1`, initial.object]]),
        ),
      },
    );
    const editedProjection = await loadArtifactSourceProjection(
      { artifact: edited.artifact, revision: edited.revision },
      {
        db: testDatabase.db,
        storage: storageReturning(
          new Map([[`artifacts/${edited.artifact.id}/project.json\0project-v1`, edited.object]]),
        ),
      },
    );

    expect(initialProjection.blocks).toEqual(editedProjection.blocks);
    expect(initialProjection.representationMetadata).toEqual({
      artifactKind: "presentation",
      input: "pptd_source",
    });
    expect(editedProjection.representationMetadata).toEqual({
      artifactKind: "presentation",
      input: "editor_json",
    });
  });

  it("prefers the reverse PPTD source when an edited revision has both representations", async () => {
    const fixture = await editorPresentationFixture(true);
    const projection = await loadArtifactSourceProjection(
      { artifact: fixture.artifact, revision: fixture.revision },
      {
        db: testDatabase.db,
        storage: storageReturning(
          new Map([
            [`artifacts/${fixture.artifact.id}/source.json\0source-v1`, fixture.sourceObject],
          ]),
        ),
      },
    );

    expect(projection.representationMetadata).toEqual({
      artifactKind: "presentation",
      input: "editor_pptd_source",
    });
    expect(projection.blocks.map((block) => block.exactText)).toEqual([
      "Quarterly report",
      "Revenue increased",
      "Speaker note",
    ]);
  });

  it("does not fall back to the source bundle when an editor snapshot is declared but missing", async () => {
    const fixture = await editorPresentationFixture();
    await testDatabase.db
      .delete(presentationEditorSnapshots)
      .where(eq(presentationEditorSnapshots.artifactRevisionId, fixture.revision.id));
    const get = vi.fn();

    await expect(
      loadArtifactSourceProjection(
        { artifact: fixture.artifact, revision: fixture.revision },
        {
          db: testDatabase.db,
          storage: {
            delete: vi.fn(),
            get,
            listVersions: vi.fn(),
            put: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("presentation_editor_snapshot_missing");
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "media type",
      object: (fixture: Awaited<ReturnType<typeof editorPresentationFixture>>) => ({
        ...fixture.object,
        contentType: "text/plain",
      }),
    },
    {
      name: "content hash",
      object: (fixture: Awaited<ReturnType<typeof editorPresentationFixture>>) => ({
        ...fixture.object,
        body: encode('{"tampered":true}'),
      }),
    },
  ])("rejects an editor project with conflicting $name", async ({ object }) => {
    const fixture = await editorPresentationFixture();

    await expect(
      loadArtifactSourceProjection(
        { artifact: fixture.artifact, revision: fixture.revision },
        {
          db: testDatabase.db,
          storage: storageReturning(
            new Map([
              [`artifacts/${fixture.artifact.id}/project.json\0project-v1`, object(fixture)],
            ]),
          ),
        },
      ),
    ).rejects.toThrow("presentation_editor_project_object_conflict");
  });

  it("fails when an initial revision has no published source bundle", async () => {
    const fixture = await initialPresentationFixture();
    await testDatabase.db
      .delete(artifactSourceBundles)
      .where(eq(artifactSourceBundles.artifactRevisionId, fixture.revision.id));
    const get = vi.fn();

    await expect(
      loadArtifactSourceProjection(
        { artifact: fixture.artifact, revision: fixture.revision },
        {
          db: testDatabase.db,
          storage: {
            delete: vi.fn(),
            get,
            listVersions: vi.fn(),
            put: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("presentation_source_bundle_missing");
    expect(get).not.toHaveBeenCalled();
  });
});
