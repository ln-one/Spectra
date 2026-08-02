import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import { type APIResponse, request } from "@playwright/test";
import { Pool } from "pg";
import { teachingDocumentRevisionContentSchema } from "../../src/features/artifacts/documents/contract";
import { mindMapRevisionContentSchema } from "../../src/features/artifacts/mind-maps/contract";
import {
  e2eArtifactDir,
  e2eAuthDir,
  e2eAuthStatePath,
  e2eBaseUrl,
  e2eDatabaseUrl,
  e2eOtherAuthStatePath,
  e2eWorkspacePath,
} from "./environment";
import { createE2eStorageClient, e2eStorageBucket } from "./storage";

async function requireOk(response: APIResponse) {
  if (!response.ok()) {
    throw new Error(`${response.url()} failed: ${await response.text()}`);
  }
  return response;
}

export default async function globalSetup() {
  const storageClient = createE2eStorageClient();
  try {
    await storageClient.send(new CreateBucketCommand({ Bucket: e2eStorageBucket }));
    await storageClient.send(
      new PutBucketVersioningCommand({
        Bucket: e2eStorageBucket,
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    await storageClient.send(
      new PutBucketCorsCommand({
        Bucket: e2eStorageBucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "HEAD", "PUT"],
              AllowedOrigins: [e2eBaseUrl],
              ExposeHeaders: ["ETag", "x-amz-version-id"],
            },
          ],
        },
      }),
    );
  } finally {
    storageClient.destroy();
  }
  const pool = new Pool({ connectionString: e2eDatabaseUrl });

  const context = await request.newContext({ baseURL: e2eBaseUrl });
  await requireOk(
    await context.post("/api/auth/sign-up/email", {
      data: {
        name: "spectra-e2e",
        email: "spectra-e2e@example.com",
        password: "Spectra2026E2E!!",
      },
    }),
  );

  const user = await pool.query<{ id: string }>('SELECT id FROM auth."user" WHERE email = $1', [
    "spectra-e2e@example.com",
  ]);
  const [authUser] = user.rows;
  if (!authUser) throw new Error("Better Auth test user was not created");
  const principal = await pool.query<{ id: string }>(
    "INSERT INTO public.principals (auth_user_id, handle) VALUES ($1, $2) RETURNING id",
    [authUser.id, "spectra-e2e"],
  );
  const [principalRow] = principal.rows;
  if (!principalRow) throw new Error("Principal test fixture was not created");
  const workspace = await pool.query<{ id: string }>(
    "INSERT INTO public.workspaces (owner_id, name) VALUES ($1, $2) RETURNING id",
    [principalRow.id, "Spectra Biology Core"],
  );
  const [workspaceRow] = workspace.rows;
  if (!workspaceRow) throw new Error("Workspace test fixture was not created");
  for (const [index, filename] of [
    "source-layout-01.pdf",
    "source-layout-02.docx",
    "source-layout-03.pptx",
    "source-layout-04.png",
    "source-layout-05.md",
  ].entries()) {
    const source = await pool.query<{ id: string }>(
      `INSERT INTO public.sources (workspace_id, kind)
       VALUES ($1, 'uploaded_file')
       RETURNING id`,
      [workspaceRow.id],
    );
    const sourceRow = source.rows[0];
    if (!sourceRow) throw new Error("Source layout test fixture was not created");
    await pool.query(
      `INSERT INTO public.file_sources (
         source_id, original_filename, size_bytes, storage_key, storage_version_id, state
       ) VALUES ($1, $2, 1024, $3, $4, 'stored')`,
      [sourceRow.id, filename, `e2e/source-layout-${index + 1}`, `version-${index + 1}`],
    );
  }
  const conversationId = randomUUID();
  const resumeConversationId = randomUUID();
  const resumeStreamId = "10000000-0000-4000-8000-000000000090";
  const gameConversationId = randomUUID();
  await pool.query(
    `INSERT INTO public.ai_conversations (
       workspace_id, created_by_principal_id, conversation_id, title, active_stream_id
     ) VALUES ($1, $2, $3, $4, $5)`,
    [workspaceRow.id, principalRow.id, resumeConversationId, "Refresh resume", resumeStreamId],
  );
  await pool.query(
    `INSERT INTO public.ai_messages (
       id, workspace_id, conversation_id, position, content
     ) VALUES ($1, $2, $3, 0, $4)`,
    [
      "user:e2e-resume",
      workspaceRow.id,
      resumeConversationId,
      {
        metadata: { spectraSurfaceContext: { type: "studio" } },
        parts: [{ text: "刷新恢复测试", type: "text" }],
        role: "user",
      },
    ],
  );
  const artifactContent = teachingDocumentRevisionContentSchema.parse({
    document: {
      content: [
        {
          attrs: { id: randomUUID() },
          content: [
            { text: "This document can be restored from conversation history.", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    generation: {
      outcome: "complete",
      rawOutput: "This document can be restored from conversation history.",
      warnings: [],
    },
    schemaVersion: 2,
    sourceMarkdown: "This document can be restored from conversation history.",
    title: "Persistent teaching document",
  });
  const artifact = await pool.query<{ id: string }>(
    `INSERT INTO public.artifacts (
       workspace_id, conversation_id, created_by_principal_id, kind, title
     ) VALUES ($1, $2, $3, 'teaching_document', $4)
     RETURNING id`,
    [workspaceRow.id, conversationId, principalRow.id, artifactContent.title],
  );
  const artifactRow = artifact.rows[0];
  if (!artifactRow) throw new Error("Artifact test fixture was not created");
  const revision = await pool.query<{ id: string }>(
    `INSERT INTO public.artifact_revisions (
       artifact_id, created_by_principal_id, revision_number, content, content_sha256
     ) VALUES ($1, $2, 1, $3, $4)
     RETURNING id`,
    [
      artifactRow.id,
      principalRow.id,
      artifactContent,
      createHash("sha256").update(JSON.stringify(artifactContent)).digest("hex"),
    ],
  );
  const revisionRow = revision.rows[0];
  if (!revisionRow) throw new Error("Artifact revision test fixture was not created");
  await pool.query("UPDATE public.artifacts SET current_revision_id = $1 WHERE id = $2", [
    revisionRow.id,
    artifactRow.id,
  ]);
  const mindMapRootId = randomUUID();
  const mindMapContent = mindMapRevisionContentSchema.parse({
    generation: {
      outcome: "complete",
      rawOutput: "Persistent mind map",
      warnings: [],
    },
    nodes: [
      { id: mindMapRootId, label: "Persistent mind map", order: 0, parentId: null },
      {
        id: randomUUID(),
        label: "Left branch",
        note: "A note restored from the canonical revision.",
        order: 0,
        parentId: mindMapRootId,
      },
      { id: randomUUID(), label: "Right branch", order: 1, parentId: mindMapRootId },
    ],
    rootId: mindMapRootId,
    schemaVersion: 2,
  });
  const mindMapArtifact = await pool.query<{ id: string }>(
    `INSERT INTO public.artifacts (
       workspace_id, conversation_id, created_by_principal_id, kind, title
     ) VALUES ($1, $2, $3, 'mind_map', $4)
     RETURNING id`,
    [workspaceRow.id, conversationId, principalRow.id, "Persistent mind map"],
  );
  const mindMapArtifactRow = mindMapArtifact.rows[0];
  if (!mindMapArtifactRow) throw new Error("Mind map Artifact test fixture was not created");
  const mindMapRevision = await pool.query<{ id: string }>(
    `INSERT INTO public.artifact_revisions (
       artifact_id, created_by_principal_id, revision_number, content, content_sha256
     ) VALUES ($1, $2, 1, $3, $4)
     RETURNING id`,
    [
      mindMapArtifactRow.id,
      principalRow.id,
      mindMapContent,
      createHash("sha256").update(JSON.stringify(mindMapContent)).digest("hex"),
    ],
  );
  const mindMapRevisionRow = mindMapRevision.rows[0];
  if (!mindMapRevisionRow) throw new Error("Mind map revision test fixture was not created");
  await pool.query("UPDATE public.artifacts SET current_revision_id = $1 WHERE id = $2", [
    mindMapRevisionRow.id,
    mindMapArtifactRow.id,
  ]);
  const gameContent = {
    descriptionMarkdown: "点击、触摸或按空格起飞。每轮答对三题中的两题即可复活。",
    questions: Array.from({ length: 6 }, (_, index) => {
      const correctOptionId = randomUUID();
      return {
        correctOptionId,
        difficulty: "easy",
        explanationMarkdown: `第 ${index + 1} 题解析。`,
        options: [
          { optionId: correctOptionId, text: `正确选项 ${index + 1}` },
          { optionId: randomUUID(), text: `干扰选项 ${index + 1}` },
        ],
        points: 1,
        promptMarkdown: `复活问题 ${index + 1}`,
        questionId: randomUUID(),
        type: "single_choice",
      };
    }),
    revival: { questionCount: 3, requiredCorrect: 2 },
    schemaVersion: 1,
    skin: "skyline_day",
    template: "flap_revival",
    title: "飞跃复活验收游戏",
  };
  const gameArtifact = await pool.query<{ id: string }>(
    `INSERT INTO public.artifacts (
       workspace_id, conversation_id, created_by_principal_id, kind, title
     ) VALUES ($1, $2, $3, 'game', $4)
     RETURNING id`,
    [workspaceRow.id, gameConversationId, principalRow.id, gameContent.title],
  );
  const gameArtifactRow = gameArtifact.rows[0];
  if (!gameArtifactRow) throw new Error("Game Artifact fixture was not created");
  const gameRevision = await pool.query<{ id: string }>(
    `INSERT INTO public.artifact_revisions (
       artifact_id, created_by_principal_id, revision_number, content, content_sha256
     ) VALUES ($1, $2, 1, $3, $4)
     RETURNING id`,
    [
      gameArtifactRow.id,
      principalRow.id,
      gameContent,
      createHash("sha256").update(JSON.stringify(gameContent)).digest("hex"),
    ],
  );
  const gameRevisionRow = gameRevision.rows[0];
  if (!gameRevisionRow) throw new Error("Game revision fixture was not created");
  await pool.query("UPDATE public.artifacts SET current_revision_id = $1 WHERE id = $2", [
    gameRevisionRow.id,
    gameArtifactRow.id,
  ]);
  const aliasedWorkspace = await pool.query<{ id: string }>(
    "INSERT INTO public.workspaces (owner_id, name) VALUES ($1, $2) RETURNING id",
    [principalRow.id, "Spectra Materials Lab"],
  );
  const [aliasedWorkspaceRow] = aliasedWorkspace.rows;
  if (!aliasedWorkspaceRow) throw new Error("Aliased workspace test fixture was not created");
  await pool.query(
    `INSERT INTO public.workspace_locators (workspace_id, owner_id, slug)
     VALUES ($1, $2, $3)`,
    [aliasedWorkspaceRow.id, principalRow.id, "materials-lab"],
  );
  await pool.query("INSERT INTO public.workspaces (owner_id, name) VALUES ($1, $2)", [
    principalRow.id,
    "Interdisciplinary Computational Biology Research and Classroom Collaboration Workspace",
  ]);

  const otherContext = await request.newContext({ baseURL: e2eBaseUrl });
  await requireOk(
    await otherContext.post("/api/auth/sign-up/email", {
      data: {
        name: "spectra-other-e2e",
        email: "spectra-other-e2e@example.com",
        password: "Spectra2026E2E!!",
      },
    }),
  );
  const otherUser = await pool.query<{ id: string }>(
    'SELECT id FROM auth."user" WHERE email = $1',
    ["spectra-other-e2e@example.com"],
  );
  const [otherAuthUser] = otherUser.rows;
  if (!otherAuthUser) throw new Error("Second Better Auth test user was not created");
  await pool.query("INSERT INTO public.principals (auth_user_id, handle) VALUES ($1, $2)", [
    otherAuthUser.id,
    "spectra-other-e2e",
  ]);
  await pool.end();

  await Promise.all([
    mkdir(e2eArtifactDir, { recursive: true }),
    mkdir(e2eAuthDir, { recursive: true, mode: 0o700 }),
  ]);
  await context.storageState({ path: e2eAuthStatePath });
  await otherContext.storageState({ path: e2eOtherAuthStatePath });
  await writeFile(
    e2eWorkspacePath,
    JSON.stringify({
      artifactId: artifactRow.id,
      gameUrl: `/workspaces/${workspaceRow.id}?conversation=${gameConversationId}&artifact=${gameArtifactRow.id}`,
      mindMapArtifactId: mindMapArtifactRow.id,
      conversationId,
      resumeConversationId,
      resumeUrl: `/workspaces/${workspaceRow.id}?conversation=${resumeConversationId}`,
      url: `/workspaces/${workspaceRow.id}?conversation=${conversationId}`,
      workspaceId: workspaceRow.id,
      aliasedId: aliasedWorkspaceRow.id,
      prettyUrl: "/spectra-e2e/materials-lab",
    }),
    "utf8",
  );
  await otherContext.dispose();
  await context.dispose();
}
